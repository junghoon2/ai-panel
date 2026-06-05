# ai-panel 구현 계획

> 본 문서는 계획 전용이다. 실제 작업의 진행 상태는 `docs/progress.md`에서 관리한다 (SSOT 원칙).

## 목표
- 하나의 터미널 창에서 질문 1회 입력으로 claude / codex / gemini 3개 CLI에 동시에 질문을 전달한다
- 3개 도구의 답변을 3분할 패널에 **실시간 스트리밍**으로 표시한다
- REPL 방식으로 후속 질문이 가능하고, 각 도구의 **대화 맥락(세션)이 유지**된다
- `ai-panel` 명령 하나로 실행 가능하게 글로벌 설치를 지원한다

---

## 사전 확인 사항 (확인 완료된 사실)

로컬 환경에서 직접 확인한 내용 (2026-06-05 기준):

| 항목 | 값 |
|------|-----|
| claude CLI | 2.1.165 (`/Users/jerry/.nvm/versions/node/v22.14.0/bin/claude`) |
| codex CLI | 0.137.0 (`/opt/homebrew/bin/codex`) |
| gemini CLI | 0.37.0 (`/opt/homebrew/bin/gemini`) |
| Node.js | v22.14.0 (nvm) |

각 CLI의 비대화형 호출 방식 (`--help` 출력으로 확인):

| 도구 | 첫 질문 | 후속 질문 (세션 유지) | 스트리밍 출력 |
|------|---------|----------------------|---------------|
| claude | `claude -p "<질문>"` | `claude -p --resume <session-id> "<질문>"` | `--output-format stream-json --include-partial-messages` |
| codex | `codex exec "<질문>"` | `codex exec resume <session-id> "<질문>"` | `--json` (JSONL 이벤트 스트림) |
| gemini | `gemini -p "<질문>"` | `gemini -p "<질문>" --resume latest` | `-o stream-json` |

- claude: stream-json의 init 이벤트에서 `session_id`를 획득해 후속 질문에 사용
- codex: JSONL 이벤트(thread/session 시작)에서 세션 id를 획득해 후속 질문에 사용
- gemini: 세션 id가 아닌 **인덱스/latest 기반** resume (프로젝트 디렉토리 단위) — 리스크 항목 참조

---

## 아키텍처 결정

| 결정 | 선택 | 근거 |
|------|------|------|
| UI 형태 | 3분할 실시간 스트리밍 TUI | 사용자 선택. 답변 비교가 한눈에 가능 |
| 대화 방식 | 연속 대화 REPL | 사용자 선택. 후속 질문 시 각 도구 세션 resume |
| 스택 | Node.js (TypeScript) + Ink 5 | 사용자 선택. claude/gemini CLI 자체가 Ink 기반이라 생태계 동일, 패널 분할·스트리밍 렌더링에 적합 |
| CLI 실행 방식 | `child_process.spawn`으로 각 CLI의 **print/exec 모드** 호출 | 인터랙티브 TUI를 감싸는 PTY 방식보다 단순·견고. 구조화된 JSON 스트림 파싱 가능 |
| 출력 파싱 | 도구별 어댑터가 stream-json/JSONL을 공통 이벤트(`delta`, `done`, `error`)로 정규화 | 도구별 포맷 차이를 어댑터 안에 격리 |

전체 구조:

```
┌─────────────────────────────────────────────┐
│  Ink App (TUI)                              │
│  ┌─────────┐ ┌─────────┐ ┌─────────┐        │
│  │ Panel   │ │ Panel   │ │ Panel   │        │
│  │ claude  │ │ codex   │ │ gemini  │        │
│  └────▲────┘ └────▲────┘ └────▲────┘        │
│       │ delta/done/error 이벤트              │
│  ┌────┴───────────┴───────────┴────┐        │
│  │ Orchestrator (질문 fan-out)      │        │
│  └────┬───────────┬───────────┬────┘        │
│  ┌────┴────┐ ┌────┴────┐ ┌────┴────┐        │
│  │ Adapter │ │ Adapter │ │ Adapter │        │
│  │ claude  │ │ codex   │ │ gemini  │        │
│  │ (spawn) │ │ (spawn) │ │ (spawn) │        │
│  └─────────┘ └─────────┘ └─────────┘        │
│  ┌─────────────────────────────────┐        │
│  │ Input (질문 입력창, /quit 등)     │        │
│  └─────────────────────────────────┘        │
└─────────────────────────────────────────────┘
```

디렉토리 구조(안):

```
ai-panel/
├── src/
│   ├── index.tsx          # 엔트리포인트 (CLI 파싱, Ink render)
│   ├── app.tsx            # 메인 App 컴포넌트 (레이아웃, REPL 루프)
│   ├── components/
│   │   ├── panel.tsx      # 도구별 답변 패널 (상태 + 스트리밍 텍스트)
│   │   └── prompt-input.tsx # 질문 입력창
│   ├── adapters/
│   │   ├── types.ts       # 공통 어댑터 인터페이스, 이벤트 타입
│   │   ├── claude.ts      # claude -p stream-json 어댑터
│   │   ├── codex.ts       # codex exec --json 어댑터
│   │   └── gemini.ts      # gemini -p stream-json 어댑터
│   └── orchestrator.ts    # fan-out, 세션 상태 관리
├── docs/
│   ├── ai-panel-plan.md
│   └── progress.md
├── package.json           # bin: { "ai-panel": "dist/index.js" }
└── tsconfig.json
```

공통 어댑터 인터페이스(안):

```typescript
interface AdapterEvent {
  type: 'delta' | 'done' | 'error';
  text?: string;        // delta: 누적할 텍스트 조각
  sessionId?: string;   // done: 다음 질문에 쓸 세션 식별자
  error?: string;
}

interface Adapter {
  name: 'claude' | 'codex' | 'gemini';
  available(): Promise<boolean>;            // CLI 설치 여부 확인
  ask(question: string, sessionId?: string): AsyncIterable<AdapterEvent>;
}
```

---

## 작업 Phase

### Phase 1 — 프로젝트 스캐폴딩
**목표:** TypeScript + Ink 빌드/실행이 되는 빈 껍데기 앱

- `npm init` + TypeScript, Ink 5, React 의존성 설치
- `tsconfig.json`, 빌드 스크립트(`tsc` 또는 `tsup`) 구성
- "Hello ai-panel"을 출력하는 최소 Ink 앱 작성
- git init + 첫 커밋 (개인 계정 erdia22@gmail.com)
- 검증: `npm run build && node dist/index.js` 실행 시 Ink 화면 출력

### Phase 2 — CLI 어댑터 레이어 (TUI 없이 동작 확인)
**목표:** 3개 CLI를 spawn해서 스트리밍 이벤트로 정규화하는 어댑터 완성

- 공통 어댑터 인터페이스(`types.ts`) 정의
- claude 어댑터: `-p --output-format stream-json --include-partial-messages` 파싱, session_id 추출
- codex 어댑터: `exec --json` JSONL 파싱, 세션 id 추출, 답변 텍스트 이벤트 필터링
- gemini 어댑터: `-p -o stream-json` 파싱
- 프로세스 에러/비정상 종료/타임아웃 → `error` 이벤트로 변환
- 검증: TUI 없이 각 어댑터를 단독 실행하는 스모크 스크립트로 실제 질문 1건 전송, delta 스트림과 done(sessionId) 수신 확인

### Phase 3 — Ink TUI (3분할 패널 + 입력창)
**목표:** 질문 입력 → 3패널 동시 스트리밍 표시

- 3분할 레이아웃 + 하단 입력창 컴포넌트
- 패널별 상태 표시 (대기 / 스트리밍 중 / 완료(소요 시간) / 에러)
- orchestrator: 질문을 3개 어댑터에 fan-out, 이벤트를 패널 상태로 반영
- 긴 답변 처리: 패널 높이 초과 시 최신 내용 우선 표시(tail) 방식
- /quit (또는 Ctrl+C) 종료 처리
- 검증: 실제 질문 1건으로 3패널 동시 스트리밍 동작 확인

### Phase 4 — 세션 연속성 (REPL 후속 질문)
**목표:** 후속 질문 시 각 도구의 대화 맥락 유지

- 도구별 세션 상태 저장 (claude/codex: 세션 id, gemini: resume latest)
- 두 번째 질문부터 resume 플래그로 호출하도록 orchestrator 수정
- 답변 완료 전 추가 입력 방지 (또는 진행 중 취소 후 새 질문)
- 검증: "내 이름은 X야" → "내 이름이 뭐라고 했지?" 2턴 질문으로 3개 도구 모두 맥락 유지 확인

### Phase 5 — 마감 (배포·편의 기능)
**목표:** 일상 사용 가능한 완성도

- 시작 시 CLI 설치 여부 검사, 미설치 도구는 패널에 안내 표시 후 나머지로 동작
- `ai-panel "질문"` 인자 지원 (시작과 동시에 첫 질문 전송)
- `--only claude,gemini` 같은 도구 선택 옵션
- package.json `bin` 등록 + `npm link`로 글로벌 명령 설치
- README 작성 (설치, 사용법, 키 바인딩)
- 검증: 새 터미널에서 `ai-panel` 실행 → 2턴 대화 E2E 확인

---

## 주요 리스크 및 대응

| 리스크 | 영향 | 대응 |
|-------|------|------|
| gemini resume이 세션 id가 아닌 latest/인덱스 기반 | 같은 디렉토리에서 별도 gemini 세션을 쓰면 다른 세션을 resume할 수 있음 | ai-panel 전용 작업 디렉토리(cwd)에서 gemini를 spawn해 세션을 격리. 구현 시 `--list-sessions`로 동작 검증 |
| 각 CLI의 stream-json/JSONL 스키마가 버전 업그레이드로 변경 | 파싱 실패 | 어댑터에 스키마를 격리하고, 알 수 없는 이벤트는 무시(skip) 정책. 파싱 실패 시 raw 텍스트 폴백 |
| codex `--json` 플래그/이벤트 구조 미확인 (help 일부만 확인) | Phase 2 차질 | Phase 2 시작 시 실제 1회 호출로 이벤트 스키마부터 확인 후 구현 |
| 3개 동시 스트리밍 시 Ink 리렌더링 성능 저하 | 화면 깜빡임, 입력 지연 | delta를 50~100ms 단위로 배칭해 setState 횟수 제한 |
| CLI 인증 만료(로그인 필요) 상태 | 해당 도구 패널 무응답 | 타임아웃 + stderr 캡처로 에러 패널 표시, 나머지 도구는 정상 동작 |
| 도구가 답변 중 권한 요청 등으로 입력 대기 | 프로세스가 영원히 종료 안 됨 | print/exec 모드는 기본적으로 비대화형이지만, 안전망으로 도구별 타임아웃(기본 120s) 적용 |

---

## 완료 기준
- `ai-panel` 실행 → 질문 입력 → 3개 패널에 실시간 스트리밍 답변 표시
- 후속 질문에서 3개 도구 모두 이전 대화 맥락을 유지
- 1개 도구가 실패(미설치/인증 만료)해도 나머지 2개는 정상 동작
- 새 터미널에서 글로벌 명령으로 실행 가능

---

## 추후 확장 (본 계획 범위 밖)
- 답변 비교/요약 패널 (3개 답변을 4번째 도구로 종합)
- 도구별 모델 선택 옵션 (`--claude-model opus` 등)
- 답변 마크다운 렌더링, 코드 블록 하이라이팅
- 스크롤백 (패널 내 위로 스크롤)
- 대화 내역 파일 저장/내보내기
- ollama 등 추가 도구 어댑터 플러그인화
