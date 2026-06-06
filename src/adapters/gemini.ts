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
import { killActiveSpawns, spawnJsonl } from './proc.js';

export const geminiAdapter: Adapter = {
  name: 'gemini',
  cancelActive: killActiveSpawns, // 턴 중단 — 실행 중인 spawn 종료

  async *ask(question: string, sessionId?: string, images?: string[]): AsyncGenerator<AdapterEvent> {
    // gemini 는 한국어 질문에도 영어로 답하는 경우가 있어, 새 세션 첫 턴에
    // 언어 지시를 붙인다 (세션 히스토리에 남으므로 후속 턴에는 불필요)
    let prompt = sessionId
      ? question
      : `(지시: 반드시 사용자의 질문과 동일한 언어로 답변할 것)\n\n${question}`;

    // 이미지는 @경로 문법으로 첨부 (공백은 "\ " 이스케이프)
    if (images && images.length > 0) {
      const refs = images.map((p) => `@${p.replace(/ /g, '\\ ')}`).join(' ');
      prompt = `${refs} ${prompt}`;
    }

    // 기본값(auto-gemini-3 라우터)은 모델 선택용 호출이 한 번 더 발생해 느리다.
    // 라우터가 일반적으로 고르는 모델을 직접 고정해 턴당 ~4초 단축 (실측 14.6s → 10.4s).
    // 모델 세대가 바뀌면 이 상수만 갱신하면 된다.
    const args = ['-o', 'stream-json', '-m', 'gemini-3-flash-preview', '-p', prompt];

    // 워크스페이스(cwd) 밖 이미지는 차단되므로 이미지 디렉토리를 워크스페이스에 추가 (실측)
    if (images && images.length > 0) {
      const dirs = [...new Set(images.map((p) => p.slice(0, p.lastIndexOf('/')) || '.'))];
      args.push('--include-directories', dirs.join(','));
    }
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
