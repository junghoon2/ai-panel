# progress

> 작업 진행 상태의 단일 원천(SSOT). 계획 내용은 `docs/ai-panel-plan.md` 참조.

## ai-panel 구현 진행 상태
> 계획 문서: `docs/ai-panel-plan.md`

### Phase 1 — 프로젝트 스캐폴딩
- [ ] npm init + TypeScript, Ink 5, React 의존성 설치
- [ ] tsconfig.json, 빌드 스크립트 구성
- [ ] 최소 Ink 앱 ("Hello ai-panel") 작성
- [ ] git init + 첫 커밋 (개인 계정)
- [ ] 검증: `npm run build && node dist/index.js` 실행 확인

### Phase 2 — CLI 어댑터 레이어
- [ ] 공통 어댑터 인터페이스 정의 (types.ts)
- [ ] claude 어댑터 (stream-json 파싱, session_id 추출)
- [ ] codex 어댑터 (exec --json JSONL 파싱, 세션 id 추출)
- [ ] gemini 어댑터 (-o stream-json 파싱)
- [ ] 에러/타임아웃 → error 이벤트 변환
- [ ] 검증: 스모크 스크립트로 3개 어댑터 각각 실제 질문 1건 전송 확인

### Phase 3 — Ink TUI
- [ ] 3분할 레이아웃 + 하단 입력창
- [ ] 패널별 상태 표시 (대기/스트리밍/완료/에러)
- [ ] orchestrator fan-out + 이벤트 → 패널 반영
- [ ] 긴 답변 tail 표시 처리
- [ ] /quit, Ctrl+C 종료 처리
- [ ] 검증: 실제 질문 1건으로 3패널 동시 스트리밍 확인

### Phase 4 — 세션 연속성
- [ ] 도구별 세션 상태 저장
- [ ] 두 번째 질문부터 resume 호출
- [ ] 답변 진행 중 입력 제어
- [ ] 검증: 2턴 질문으로 3개 도구 맥락 유지 확인

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
