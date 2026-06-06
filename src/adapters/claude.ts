// claude 어댑터 — 상시 유지(persistent) 워커 방식
//
// `claude -p --input-format stream-json` 프로세스를 한 번 띄워두고,
// 질문마다 stdin 으로 user 메시지를 보내 같은 프로세스(=같은 세션)에서 답을 받는다.
// 턴마다 프로세스 기동·설정 로드가 반복되지 않아 spawn 방식보다 턴당 ~1초 빠르다 (실측).
//
// 실측한 이벤트 (claude 2.1.165, spawn 방식과 동일 스키마):
//   {"type":"system","subtype":"init",...,"session_id":"..."}
//   {"type":"stream_event","event":{"type":"content_block_delta",
//     "delta":{"type":"text_delta","text":"..."}},...}
//   {"type":"result","subtype":"success","result":"<전체 답변>","is_error":false,...}  ← 턴 경계
//
// 워커가 죽으면(크래시/타임아웃 kill) 다음 질문에서 마지막 session_id 로
// --resume 해 대화 맥락을 복구한 새 워커를 띄운다.
import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { createInterface } from 'node:readline';
import type { Adapter, AdapterEvent } from './types.js';
import { errorMessage } from './types.js';
import { DEFAULT_TIMEOUT_MS } from './proc.js';
import { imageMimeType } from '../image.js';

const BASE_ARGS = [
  '-p',
  '--input-format', 'stream-json',
  '--output-format', 'stream-json',
  '--include-partial-messages',
  '--verbose',
  // Q&A 패널에는 사용자 훅·MCP 서버가 불필요 — 로드 생략으로 기동 단축 (실측)
  '--strict-mcp-config',
  '--setting-sources', '',
];

class ClaudeWorker {
  private child?: ChildProcessWithoutNullStreams;
  private lines?: AsyncIterator<string>;
  private sessionId?: string;
  private stderrTail = '';

  /** 워커가 없으면 띄운다. 이전 세션이 있으면 --resume 으로 맥락을 복구한다. */
  start(resumeSessionId?: string): void {
    if (this.child) return;

    const args = [...BASE_ARGS];
    const sid = resumeSessionId ?? this.sessionId;
    if (sid) args.push('--resume', sid);

    const child = spawn('claude', args, { stdio: ['pipe', 'pipe', 'pipe'] });
    this.stderrTail = '';
    child.stderr.on('data', (chunk: Buffer) => {
      this.stderrTail = (this.stderrTail + chunk.toString()).slice(-2000);
    });
    // spawn 실패(ENOENT 등) — stdout 을 닫아 ask 루프가 즉시 종료 분기로 빠지게 한다
    child.on('error', (err) => {
      this.stderrTail = err.message;
      child.stdout.destroy();
      if (this.child === child) this.child = undefined;
    });
    child.on('close', () => {
      if (this.child === child) this.child = undefined;
    });

    this.child = child;
    // readline 이터레이터는 워커 수명 동안 유지 — 턴 사이 도착분은 내부 버퍼에 쌓인다
    this.lines = createInterface({ input: child.stdout })[Symbol.asyncIterator]();
  }

  kill(): void {
    this.child?.kill('SIGKILL');
    this.child = undefined;
  }

  async *ask(question: string, sessionId?: string, images?: string[]): AsyncGenerator<AdapterEvent> {
    try {
      this.start(sessionId);
      const child = this.child;
      const lines = this.lines;
      if (!child || !lines) {
        yield { type: 'error', error: `claude 워커 기동 실패: ${this.stderrTail || '알 수 없는 오류'}` };
        return;
      }

      // 이미지는 base64 image 블록으로 텍스트 앞에 첨부한다
      const content: unknown[] = (images ?? []).map((path) => ({
        type: 'image',
        source: {
          type: 'base64',
          media_type: imageMimeType(path),
          data: readFileSync(path).toString('base64'),
        },
      }));
      content.push({ type: 'text', text: question });

      child.stdin.write(
        JSON.stringify({ type: 'user', message: { role: 'user', content } }) + '\n',
      );

      let sawDelta = false;
      let finalText = '';
      let timedOut = false;
      const timer = setTimeout(() => {
        timedOut = true;
        this.kill(); // 스트림이 닫혀 아래 루프가 종료 분기로 빠진다
      }, DEFAULT_TIMEOUT_MS);

      try {
        for (;;) {
          const { value: line, done } = await lines.next();
          if (done) {
            // 워커 사망 (타임아웃 kill / 크래시 / 미설치) — 다음 ask 에서 resume 재기동
            this.kill();
            yield {
              type: 'error',
              error: timedOut
                ? `${Math.round(DEFAULT_TIMEOUT_MS / 1000)}초 타임아웃으로 중단됨`
                : `claude 프로세스 종료: ${this.stderrTail.trim().slice(-300) || '알 수 없는 오류'}`,
            };
            return;
          }

          const trimmed = line.trim();
          if (!trimmed.startsWith('{')) continue;
          let ev: any;
          try {
            ev = JSON.parse(trimmed);
          } catch {
            continue;
          }

          if (typeof ev.session_id === 'string') this.sessionId = ev.session_id;

          if (ev.type === 'stream_event') {
            const e = ev.event;
            if (e?.type === 'content_block_delta' && e.delta?.type === 'text_delta' && e.delta.text) {
              sawDelta = true;
              yield { type: 'delta', text: e.delta.text };
            }
          } else if (ev.type === 'result') {
            // 턴 경계 — 워커는 살려둔 채 이번 턴만 끝낸다
            if (ev.is_error) {
              yield { type: 'error', error: String(ev.result ?? 'claude 오류') };
              return;
            }
            finalText = String(ev.result ?? '');
            break;
          }
        }
      } finally {
        clearTimeout(timer);
      }

      if (!sawDelta && finalText) yield { type: 'delta', text: finalText };
      yield { type: 'done', sessionId: this.sessionId };
    } catch (err) {
      this.kill();
      yield { type: 'error', error: errorMessage(err) };
    }
  }
}

const worker = new ClaudeWorker();

// 비정상 종료(시그널 등) 안전망 — 정상 종료 경로는 dispose 가 담당한다
process.on('exit', () => worker.kill());

export const claudeAdapter: Adapter = {
  name: 'claude',
  // 앱 시작 시 미리 기동 — 첫 질문에서 기동 비용이 빠진다
  prewarm: () => worker.start(),
  // 워커의 파이프 핸들이 이벤트 루프를 잡고 있어, 종료 시 명시적으로 정리해야
  // 부모 프로세스가 빠진다 (정리 안 하면 /exit 후에도 프로세스가 남는다)
  dispose: () => worker.kill(),
  // 턴 중단 — 워커를 죽이면 진행 중이던 ask 루프가 종료 분기로 빠지고,
  // 다음 질문에서 마지막 세션을 --resume 해 맥락을 복구한다
  cancelActive: () => worker.kill(),
  ask: (question, sessionId, images) => worker.ask(question, sessionId, images),
};
