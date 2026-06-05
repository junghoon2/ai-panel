# progress

> 작업 진행 상태의 단일 원천(SSOT). 계획 내용은 `docs/ai-panel-plan.md` 참조.

## ai-panel 구현 진행 상태
> 계획 문서: `docs/ai-panel-plan.md`

### Phase 1 — 프로젝트 스캐폴딩
- [x] npm init + TypeScript, Ink, React 의존성 설치 (ink 7.0.5, react 19.2.7, ts 6.0.3 — 계획의 Ink 5 대신 최신 Ink 7 사용)
- [x] tsconfig.json, 빌드 스크립트 구성 (소스는 `src/` 단일 디렉토리, 산출물은 `dist/`)
- [x] 최소 Ink 앱 ("Hello ai-panel") 작성
- [x] git init + 첫 커밋 (개인 계정)
- [x] 검증: `npm run build && node dist/index.js` 실행 확인 (2026-06-05)

### Phase 2 — CLI 어댑터 레이어
- [x] 공통 어댑터 인터페이스 정의 (types.ts) + spawn/JSONL 공통 헬퍼 (proc.ts)
- [x] claude 어댑터 (stream-json 파싱, session_id 추출)
- [x] codex 어댑터 (exec --json JSONL 파싱, thread_id 추출, --skip-git-repo-check)
- [x] gemini 어댑터 (-o stream-json 파싱, resume은 latest 기반)
- [x] 에러/타임아웃 → error 이벤트 변환 (ENOENT 케이스 검증 완료)
- [x] 검증: 스모크 스크립트(`node dist/smoke.js <도구> "<질문>"`)로 3개 어댑터 실제 질문 1건 전송 확인 (2026-06-05, claude 6.9s / codex 8.8s / gemini 12.7s, 모두 delta+done(sessionId) 수신)

> 실측 메모: codex는 토큰 델타 없이 `item.completed`로 전체 답변이 한 번에 옴. claude는 stream_event의 text_delta로 토큰 스트리밍.

### Phase 3 — Ink TUI
- [x] 3분할 레이아웃 + 하단 입력창 (입력 청크 내 개행 처리 보강)
- [x] 패널별 상태 표시 (○대기/◐스트리밍/✔완료+소요시간/✖에러)
- [x] orchestrator fan-out + 이벤트 → 패널 반영 (델타는 ref 누적 + 100ms tick 배칭 렌더)
- [x] 긴 답변 tail 표시 처리 (한글 전각 폭 반영 줄바꿈, src/text.ts)
- [x] /quit, Ctrl+C 종료 처리 (tmux로 종료 코드 0 확인)
- [x] 검증: tmux에서 실제 질문으로 3패널 동시 스트리밍·완료 확인 (2026-06-05)

> 실측 메모: 응답 중에는 입력이 잠긴다(설계). gemini가 간헐적으로 50s+ 걸리는 경우 관찰됨 (타임아웃 120s 안전망 동작 범위).

### Phase 4 — 세션 연속성
- [x] 도구별 세션 상태 저장 (orchestrator SessionMap, done 시 갱신)
- [x] 두 번째 질문부터 resume 호출 (claude/codex: 세션 id, gemini: --resume latest)
- [x] 답변 진행 중 입력 제어 (busy 동안 입력 잠금)
- [x] 검증: 스모크 + TUI 양쪽에서 2턴 질문("내 이름은 보라돌이야" → "내 이름이 뭐라고 했지?")으로 3개 도구 모두 "보라돌이" 응답 확인 (2026-06-05)

### Phase 5 — 마감
- [x] 시작 시 CLI 설치 여부 검사 + 미설치 도구는 ✖ 패널 안내 후 나머지로 동작 (PATH 제한 시나리오로 검증)
- [x] `ai-panel "질문"` 인자 지원 (마운트 직후 1회 자동 전송)
- [x] `--only` 도구 선택 옵션 (잘못된 도구명 검증 포함)
- [x] bin 등록 + npm link 글로벌 설치 (`which ai-panel` 확인)
- [x] README 작성
- [x] 검증: 새 tmux 세션에서 글로벌 `ai-panel`로 2턴 대화("뚜비" 맥락 유지) + /quit 정상 종료 확인 (2026-06-05)

---

## 교차 리뷰 기능 진행 상태
> 계획 문서: `docs/cross-review-plan.md`

### Phase 1 — 기반 작업 (orchestrator 일반화 + 상태 저장)
- [x] orchestrator에 runTasks 추가, runQuestion은 래퍼로 전환
- [x] lastUserQuestion / lastAnswers 저장 (일반 턴 done 시점만)
- [x] notice 줄 추가 (명령 피드백용)
- [x] 검증: 기존 질문/후속 질문/종료 플로우 회귀 확인 (2026-06-05)

### Phase 2 — /review <리뷰어> <대상> 단일 리뷰
- [x] /review 명령 파싱 + 유효성 검증 (src/review.ts parseReviewCommand)
- [x] 리뷰 프롬프트 빌더 (src/review.ts buildReviewPrompt)
- [x] 리뷰어 패널만 실행 (세션 resume, lastAnswers 갱신 제외 — makeHandlers(false))
- [x] 리뷰 중 헤더 표시 (리뷰: 리뷰어 ← 대상)
- [x] 검증: 질문 → /review claude gemini → claude가 자기 답변과 비교하는 리뷰 표시, gemini 원본 유지, 같은 도구 지정 시 notice, 리뷰 후 후속 질문 맥락 정상 (2026-06-05)

### Phase 3 — /review all + 마감
- [ ] /review all 교차 리뷰 (3패널 동시)
- [ ] 답변 없는 도구 제외 + notice 안내
- [ ] 오류 케이스 정리 (인자 부족, 알 수 없는 도구, 답변 전 실행)
- [ ] README 사용법 갱신
- [ ] 검증: E2E — /review all 교차 리뷰 + 오류 명령 notice 확인

---

## 세션 로그
- 2026-06-05: 계획 수립 (docs/ai-panel-plan.md 작성). CLI 3종 설치·옵션 확인 완료 (claude 2.1.165, codex 0.137.0, gemini 0.37.0).
- 2026-06-05: Phase 1~5 전체 구현·검증 완료. 계획의 완료 기준 4개 항목 모두 충족 (3분할 스트리밍, 세션 연속성, 부분 실패 허용, 글로벌 명령). 테스트용 tmux를 brew로 설치함. 리모트 레포 없음 — push 미수행.
