// claude 어댑터 — `claude -p --output-format stream-json --include-partial-messages`
//
// 실측한 이벤트 (claude 2.1.165):
//   {"type":"system","subtype":"init",...,"session_id":"..."}        ← 세션 id
//   {"type":"system","subtype":"hook_*",...}                          ← 훅 노이즈 (무시)
//   {"type":"stream_event","event":{"type":"content_block_delta",
//     "delta":{"type":"text_delta","text":"..."}},...}                ← 텍스트 조각
//   {"type":"result","subtype":"success","result":"<전체 답변>",
//     "is_error":false,"session_id":"..."}                            ← 종료
import type { Adapter, AdapterEvent } from './types.js';
import { errorMessage } from './types.js';
import { spawnJsonl } from './proc.js';

export const claudeAdapter: Adapter = {
  name: 'claude',

  async *ask(question: string, sessionId?: string): AsyncGenerator<AdapterEvent> {
    const args = [
      '-p',
      '--output-format', 'stream-json',
      '--include-partial-messages',
      '--verbose',
      // Q&A 패널에는 사용자 훅·MCP 서버가 불필요 — 로드 생략으로 턴당 ~1초 단축 (실측)
      '--strict-mcp-config',
      '--setting-sources', '',
    ];
    if (sessionId) args.push('--resume', sessionId);
    args.push(question);

    let sid = sessionId;
    let sawDelta = false;
    let finalText = '';

    try {
      for await (const raw of spawnJsonl('claude', args)) {
        // 이벤트 스키마가 느슨하므로 any 로 다루고, 모르는 이벤트는 무시한다
        const ev = raw as any;
        if (typeof ev.session_id === 'string') sid = ev.session_id;

        if (ev.type === 'stream_event') {
          const e = ev.event;
          if (e?.type === 'content_block_delta' && e.delta?.type === 'text_delta' && e.delta.text) {
            sawDelta = true;
            yield { type: 'delta', text: e.delta.text };
          }
        } else if (ev.type === 'result') {
          if (ev.is_error) {
            yield { type: 'error', error: String(ev.result ?? 'claude 오류') };
            return;
          }
          finalText = String(ev.result ?? '');
        }
      }

      // 델타가 한 번도 안 왔으면 (스키마 변경 등) result 전문으로 폴백
      if (!sawDelta && finalText) yield { type: 'delta', text: finalText };
      yield { type: 'done', sessionId: sid };
    } catch (err) {
      yield { type: 'error', error: errorMessage(err) };
    }
  },
};
