// 어댑터 공통 타입 — 도구별 출력 포맷 차이를 이 이벤트로 정규화한다

export type AdapterName = 'claude' | 'codex' | 'gemini';

export interface AdapterEvent {
  /** delta: 답변 텍스트 조각(누적), done: 정상 종료, error: 실패 */
  type: 'delta' | 'done' | 'error';
  /** delta 일 때 누적할 텍스트 */
  text?: string;
  /** done 일 때 다음 질문(resume)에 사용할 세션 식별자 */
  sessionId?: string;
  /** error 일 때 사용자에게 보여줄 메시지 */
  error?: string;
}

export interface Adapter {
  name: AdapterName;
  /**
   * 질문 1건을 전송하고 이벤트 스트림을 돌려준다.
   * sessionId 가 있으면 해당 세션을 이어서(resume) 질문한다.
   * images 는 도구별 네이티브 방식으로 첨부한다.
   * 스트림은 반드시 done 또는 error 로 끝난다 (throw 하지 않음).
   */
  ask(question: string, sessionId?: string, images?: string[]): AsyncGenerator<AdapterEvent>;
  /** 앱 시작 시 미리 기동할 수 있는 도구의 사전 준비 (상시 유지 워커 등, 선택) */
  prewarm?(): void;
  /** 앱 종료 시 상시 워커 등 보유 자원 정리 (선택) */
  dispose?(): void;
  /** 진행 중인 응답을 즉시 중단한다 (ESC 턴 취소용, 선택) */
  cancelActive?(): void;
}

/** unknown 에러를 사용자 표시용 문자열로 변환 */
export function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}
