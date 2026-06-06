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

/** 도구별로 서로 다른 프롬프트를 보낼 수 있는 실행 단위 (교차 리뷰 등) */
export interface AgentTask {
  name: AdapterName;
  question: string;
  /** 첨부할 이미지 파일 경로 (도구별 네이티브 방식으로 전달됨) */
  images?: string[];
}

/** 진행 중인 턴을 중단할 수 있는 핸들 */
export interface RunController {
  cancel(): void;
}

export function runTasks(tasks: AgentTask[], sessions: SessionMap, h: RunHandlers): RunController {
  let remaining = tasks.length;
  let canceled = false;
  const settle = () => {
    remaining -= 1;
    if (remaining === 0) h.onAllSettled();
  };

  for (const { name, question, images } of tasks) {
    void (async () => {
      h.onStart(name);
      try {
        for await (const ev of adapters[name].ask(question, sessions[name], images)) {
          if (ev.type === 'delta') {
            h.onDelta(name, ev.text ?? '');
          } else if (ev.type === 'done') {
            if (ev.sessionId) sessions[name] = ev.sessionId; // 다음 질문에서 resume
            h.onDone(name);
          } else {
            // 취소로 죽인 프로세스의 에러 메시지는 "사용자 중단" 으로 정리
            h.onError(name, canceled ? '사용자 중단 (ESC)' : (ev.error ?? '알 수 없는 오류'));
          }
        }
      } catch (err) {
        // 어댑터는 throw 하지 않는 계약이지만 안전망으로 잡는다
        h.onError(name, canceled ? '사용자 중단 (ESC)' : errorMessage(err));
      }
      settle();
    })();
  }

  return {
    cancel() {
      if (canceled) return;
      canceled = true;
      // 자식 프로세스를 죽이면 각 어댑터 스트림이 에러 이벤트로 끝나고 settle 된다
      for (const { name } of tasks) adapters[name].cancelActive?.();
    },
  };
}

/** 같은 질문을 여러 도구에 fan-out 하는 기본 경로 */
export function runQuestion(
  names: AdapterName[],
  question: string,
  sessions: SessionMap,
  h: RunHandlers,
): void {
  runTasks(
    names.map((name) => ({ name, question })),
    sessions,
    h,
  );
}
