// 오케스트레이터 — 질문 1건을 선택된 어댑터들에 fan-out 하고 이벤트를 콜백으로 전달
import { adapters } from './adapters/index.js';
import type { AdapterName } from './adapters/types.js';
import { errorMessage } from './adapters/types.js';

/** 도구별 resume 용 세션 식별자 저장소 (done 시 갱신됨) */
export type SessionMap = Partial<Record<AdapterName, string>>;

export interface RunHandlers {
  onStart(name: AdapterName): void;
  onDelta(name: AdapterName, text: string): void;
  onDone(name: AdapterName): void;
  onError(name: AdapterName, error: string): void;
  /** 모든 도구가 done 또는 error 로 끝났을 때 1회 호출 */
  onAllSettled(): void;
}

export function runQuestion(
  names: AdapterName[],
  question: string,
  sessions: SessionMap,
  h: RunHandlers,
): void {
  let remaining = names.length;
  const settle = () => {
    remaining -= 1;
    if (remaining === 0) h.onAllSettled();
  };

  for (const name of names) {
    void (async () => {
      h.onStart(name);
      try {
        for await (const ev of adapters[name].ask(question, sessions[name])) {
          if (ev.type === 'delta') {
            h.onDelta(name, ev.text ?? '');
          } else if (ev.type === 'done') {
            if (ev.sessionId) sessions[name] = ev.sessionId; // 다음 질문에서 resume
            h.onDone(name);
          } else {
            h.onError(name, ev.error ?? '알 수 없는 오류');
          }
        }
      } catch (err) {
        // 어댑터는 throw 하지 않는 계약이지만 안전망으로 잡는다
        h.onError(name, errorMessage(err));
      }
      settle();
    })();
  }
}
