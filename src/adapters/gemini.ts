// gemini 어댑터 — `gemini -p <질문> -o stream-json`
//
// 실측한 이벤트 (gemini 0.37.0):
//   {"type":"init","session_id":"...","model":"..."}                  ← 세션 id
//   {"type":"message","role":"user","content":"..."}                  ← 입력 echo (무시)
//   {"type":"message","role":"assistant","content":"...","delta":true} ← 텍스트 조각
//   {"type":"result","status":"success","stats":{...}}                ← 종료
//
// 주의: resume 이 세션 id 가 아닌 latest/인덱스 기반이라 같은 cwd 의
//       최근 세션을 이어간다. ai-panel 프로세스의 cwd 기준으로 격리된다.
import type { Adapter, AdapterEvent } from './types.js';
import { errorMessage } from './types.js';
import { spawnJsonl } from './proc.js';

export const geminiAdapter: Adapter = {
  name: 'gemini',

  async *ask(question: string, sessionId?: string): AsyncGenerator<AdapterEvent> {
    const args = ['-o', 'stream-json', '-p', question];
    // 세션 id 지정이 불가능하므로 직전 세션(latest)을 이어간다
    if (sessionId) args.push('--resume', 'latest');

    let sid = sessionId;
    let sawDelta = false;
    let lastAssistantFull = '';

    try {
      for await (const raw of spawnJsonl('gemini', args)) {
        const ev = raw as any;

        if (ev.type === 'init' && typeof ev.session_id === 'string') {
          sid = ev.session_id;
        } else if (ev.type === 'message' && ev.role === 'assistant' && ev.content) {
          if (ev.delta) {
            sawDelta = true;
            yield { type: 'delta', text: String(ev.content) };
          } else {
            // 델타가 아닌 전체 메시지는 폴백용으로만 보관 (중복 출력 방지)
            lastAssistantFull = String(ev.content);
          }
        } else if (ev.type === 'result' && ev.status && ev.status !== 'success') {
          yield { type: 'error', error: String(ev.error?.message ?? ev.status) };
          return;
        }
      }

      if (!sawDelta && lastAssistantFull) yield { type: 'delta', text: lastAssistantFull };
      yield { type: 'done', sessionId: sid };
    } catch (err) {
      yield { type: 'error', error: errorMessage(err) };
    }
  },
};
