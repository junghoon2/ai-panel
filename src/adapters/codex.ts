// codex 어댑터 — `codex exec --json` (JSONL 이벤트 스트림)
//
// 실측한 이벤트 (codex-cli 0.137.0):
//   {"type":"thread.started","thread_id":"..."}                       ← 세션 id
//   {"type":"turn.started"}
//   {"type":"item.completed","item":{"type":"agent_message","text":"<전체 답변>"}}
//   {"type":"turn.completed","usage":{...}}                           ← 종료
//
// 주의: 토큰 단위 델타가 없고 agent_message 가 한 번에 온다.
//       stderr 에 MCP 연결 에러 로그가 섞이므로 stdout JSONL 만 신뢰한다.
import type { Adapter, AdapterEvent } from './types.js';
import { errorMessage } from './types.js';
import { killActiveSpawns, spawnJsonl } from './proc.js';

// codex exec 는 비대화형이라 승인 프롬프트가 없다 — 샌드박스 모드로 쓰기 여부가 정해진다.
// 기본은 read-only(플래그 생략) — 파일 쓰기 거부, 읽기만 동작.
// "쓰기 권한 추가해줘" 로 켜면 --sandbox workspace-write 를 붙여 워크스페이스 내 파일 생성·편집을 허용한다
// (워크스페이스 밖·full-access 는 범위 밖이라 여전히 막힌다).
// 매 턴 새 프로세스를 띄우므로 claude 와 달리 워커 재기동이 필요 없다 — 다음 질문부터 바로 적용.
let writeEnabled = false; // 기본 읽기 전용 — "쓰기 권한 추가해줘" 로 켠다

export const codexAdapter: Adapter = {
  name: 'codex',
  cancelActive: killActiveSpawns, // 턴 중단 — 실행 중인 spawn 종료
  setWriteAccess: (on) => {
    writeEnabled = on;
  },

  async *ask(question: string, sessionId?: string, images?: string[]): AsyncGenerator<AdapterEvent> {
    // 옵션은 exec 바로 뒤, resume 은 서브커맨드로 이어붙인다
    const args = ['exec', '--json', '--skip-git-repo-check'];
    if (writeEnabled) args.push('--sandbox', 'workspace-write');
    if (sessionId) args.push('resume', sessionId);
    // -i 는 가변 인자라 프롬프트를 삼키지 않도록 '--' 구분자가 필수다 (실측)
    for (const path of images ?? []) args.push('-i', path);
    args.push('--', question);

    let sid = sessionId;

    try {
      for await (const raw of spawnJsonl('codex', args)) {
        const ev = raw as any;

        if (ev.type === 'thread.started' && typeof ev.thread_id === 'string') {
          sid = ev.thread_id;
        } else if (ev.type === 'item.completed' && ev.item?.type === 'agent_message' && ev.item.text) {
          yield { type: 'delta', text: ev.item.text };
        } else if (ev.type === 'turn.failed' || ev.type === 'error') {
          yield { type: 'error', error: String(ev.error?.message ?? ev.message ?? 'codex 오류') };
          return;
        }
      }
      yield { type: 'done', sessionId: sid };
    } catch (err) {
      yield { type: 'error', error: errorMessage(err) };
    }
  },
};
