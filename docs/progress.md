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
- [ ] 시작 시 CLI 설치 여부 검사 + 미설치 안내
- [ ] `ai-panel "질문"` 인자 지원
- [ ] `--only` 도구 선택 옵션
- [ ] bin 등록 + npm link 글로벌 설치
- [ ] README 작성
- [ ] 검증: 새 터미널에서 E2E 2턴 대화 확인

---

## 세션 로그
- 2026-06-05: 계획 수립 (docs/ai-panel-plan.md 작성). CLI 3종 설치·옵션 확인 완료 (claude 2.1.165, codex 0.137.0, gemini 0.37.0).
