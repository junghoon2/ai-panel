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
import { spawnJsonl } from './proc.js';

export const codexAdapter: Adapter = {
  name: 'codex',

  async *ask(question: string, sessionId?: string): AsyncGenerator<AdapterEvent> {
    // 옵션은 exec 바로 뒤, resume 은 서브커맨드로 이어붙인다
    const args = ['exec', '--json', '--skip-git-repo-check'];
    if (sessionId) args.push('resume', sessionId);
    args.push(question);

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
