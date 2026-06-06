# ai-panel

**claude / codex / gemini 3개 AI CLI에 한 번에 질문하고, 답변을 나란히 비교하는 터미널 앱.**

질문 하나를 입력하면 3개 도구가 동시에 답하고, 실시간 스트리밍으로 3분할 화면에 표시됩니다.
후속 질문은 각 도구의 대화 맥락이 유지된 채 이어지고, 도구끼리 서로의 답변을 리뷰시킬 수도 있습니다.

```
 ai-panel 질문: EKS가 뭔지 두 문장으로 설명해줘
╭──────────────────────╮╭──────────────────────╮╭──────────────────────╮
│ ✔ claude 8.0s        ││ ✔ codex 8.9s         ││ ◐ gemini 12s         │
│ EKS(Amazon Elastic   ││ EKS는 AWS가 관리해   ││ Amazon EKS는 AWS에   │
│ Kubernetes Service)  ││ 주는 Kubernetes 서   ││ 서 제공하는 관리형   │
│ 는 AWS가 관리해주는  ││ 비스로, 컨테이너화   ││ Kubernetes...        │
│ ...                  ││ ...                  ││ ▌                    │
╰──────────────────────╯╰──────────────────────╯╰──────────────────────╯
╭────────────────────────────────────────────────────────────────────╮
│ > 다음 질문 입력...                                                 │
╰────────────────────────────────────────────────────────────────────╯
```

## 주요 기능

- **동시 질문** — 질문 1개로 3개 AI의 답변을 실시간 비교
- **대화 맥락 유지** — 후속 질문 시 각 도구의 세션이 이어짐 (resume)
- **교차 리뷰** — `/review claude gemini` 처럼 한 도구에게 다른 도구의 답변을 리뷰시킴
- **이미지 질문** — 스크린샷을 드래그&드롭하거나 `Ctrl+V` 로 붙여넣어 3개 도구에 동시 첨부
- **대화 히스토리** — 지나간 턴은 터미널 스크롤백에 남아 위로 스크롤하면 확인 가능
- **부분 실패 허용** — 일부 CLI가 미설치/오류여도 나머지 도구로 동작

## 설치

### 1) 사전 준비

**Node.js 22 이상**이 필요합니다.

아래 AI CLI 중 **1개 이상**을 설치하고 로그인해 두세요 (3개 모두 권장):

| 도구 | 설치 | 로그인 |
|------|------|--------|
| [Claude Code](https://claude.com/claude-code) | `npm install -g @anthropic-ai/claude-code` | `claude` 실행 후 안내 따라 로그인 |
| [Codex CLI](https://github.com/openai/codex) | `npm install -g @openai/codex` 또는 `brew install codex` | `codex` 실행 후 ChatGPT 계정 로그인 |
| [Gemini CLI](https://github.com/google-gemini/gemini-cli) | `npm install -g @google/gemini-cli` 또는 `brew install gemini-cli` | `gemini` 실행 후 Google 계정 로그인 |

각 CLI가 단독으로 동작하는지 먼저 확인하세요 (예: `claude -p "hi"`).

### 2) ai-panel 설치

```bash
git clone https://github.com/junghoon2/ai-panel.git
cd ai-panel
npm install
npm run build
npm link        # 어디서든 ai-panel 명령 사용 가능
```

### 3) 실행

```bash
ai-panel
```

## 사용법

```bash
ai-panel                          # 빈 화면으로 시작해 질문 입력
ai-panel "첫 질문"                 # 시작과 동시에 첫 질문 전송
ai-panel --only claude,gemini     # 선택한 도구만 사용
```

| 입력 | 동작 |
|------|------|
| 텍스트 + Enter | 3개 도구에 동시 질문 |
| 후속 질문 | 각 도구의 **대화 맥락이 유지**된 상태로 질문 (resume) |
| 질문 + 이미지 경로 | 경로(.png/.jpg/.jpeg/.gif/.webp)를 자동 감지해 3개 도구에 이미지 첨부. 스크린샷 파일을 터미널에 드래그&드롭하면 됨 |
| `Ctrl+V` | **클립보드의 이미지**를 입력창에 첨부 (`[Image #N]` 칩으로 표시). Cmd+Ctrl+Shift+4 로 캡처한 직후 사용. macOS 전용 |
| `/paste [질문]` | Ctrl+V 와 동일하지만 명령형 — 클립보드 이미지 첨부 + 즉시 질문 전송 |
| `/claude <질문>` 등 | **해당 도구에게만** 질문 (이번 턴만). 다른 패널의 답변은 유지됨. `/codex`, `/gemini` 동일 |
| `/claude` (질문 없이) | **전용 모드** 전환 — 이후 모든 질문이 해당 도구에게만 감 (헤더에 `[claude 전용]` 표시) |
| `/all` | 전용 모드 해제 — 다시 모든 도구에게 질문 |
| `/review <리뷰어> <대상>` | 리뷰어가 대상 도구의 답변을 리뷰 (예: `/review claude gemini`) |
| `/review all` | 각 도구가 나머지 도구들의 답변을 교차 리뷰 (3패널 동시) |
| `/exit` (별칭: `/quit`, `/q`) | 종료 |
| Ctrl+C | 종료 |

- `/` 를 입력하면 명령 자동 완성 후보가 표시됩니다 (↑↓ 선택, Tab/Enter 완성)
- 답변이 진행 중일 때는 입력이 잠깁니다 (모든 패널 완료 후 다음 질문 가능)

> **이미지 붙여넣기는 왜 Cmd+V가 아닌가?** Cmd+V 는 터미널 에뮬레이터가 가로채는 GUI 단축키라
> 클립보드가 이미지일 때 앱에 아무것도 전달되지 않습니다. 그래서 Claude Code 와 동일하게
> **Ctrl+V** 를 사용합니다. 자세한 구조는 [docs/images/paste-flow.png](docs/images/paste-flow.png) 참고.

### 교차 리뷰 동작

리뷰는 리뷰어의 **기존 대화 세션을 이어서** 수행되므로, 자기 답변과 비교하는 리뷰가 나옵니다.
리뷰 대상은 항상 마지막 일반 질문의 답변이며, 리뷰 결과 자체는 다시 리뷰 대상이 되지 않습니다.

## 동작 방식

각 CLI를 **비대화형(print/exec) 모드**로 실행하고, 구조화된 스트림 출력을 파싱해 공통 이벤트로 정규화합니다.

| 도구 | 방식 | 후속 질문 (세션 유지) |
|------|------|----------------------|
| claude | **상시 유지 워커** — `claude -p --input-format stream-json` 프로세스를 앱 시작 시 미리 띄워두고 stdin 으로 질문 전송 | 같은 프로세스 = 같은 세션 (워커 사망 시 `--resume` 으로 복구) |
| codex | 질문마다 spawn — `codex exec --json --skip-git-repo-check` | `codex exec resume <session-id>` |
| gemini | 질문마다 spawn — `gemini -p <질문> -o stream-json -m <모델 고정>` | `--resume latest` |

- claude 는 토큰 단위로 스트리밍되고, codex 는 답변이 한 번에 도착합니다 (CLI 출력 특성)
- claude 워커는 사용자 훅·MCP 로드를 생략하고, gemini 는 auto 라우터 대신 모델을 고정해 응답 지연을 줄였습니다
- 이미지 첨부는 도구별 네이티브 방식 사용: claude 는 base64 image 블록, codex 는 `-i <경로> --`, gemini 는 `@경로` + `--include-directories`
- API 키가 따로 필요 없습니다 — 각 CLI 의 로그인 세션을 그대로 사용합니다

## 문제 해결

| 증상 | 원인 / 해결 |
|------|------------|
| 패널에 "CLI 미설치" 표시 | 해당 CLI 가 PATH 에 없음. 설치 후 다시 실행 (나머지 도구는 정상 동작) |
| 특정 도구만 오류/무응답 | 해당 CLI 의 로그인 만료 가능성. 단독 실행(`claude` 등)으로 로그인 상태 확인. 도구별 120초 타임아웃 후 오류 표시됨 |
| gemini 가 유독 느림 | gemini CLI 특성 (간헐적으로 30초 이상). 모델 고정으로 완화되어 있음 |
| 답변이 잘려 보임 | 패널은 최신 내용 우선(tail) 표시. 전체 답변은 턴이 끝난 뒤 스크롤백(위로 스크롤)에서 확인 |
| `ai-panel` 명령을 찾을 수 없음 | `npm link` 를 다시 실행하거나 `node dist/index.js` 로 직접 실행 |

## 개발

```bash
npm run build                                  # tsc 빌드 (src/ → dist/)
node dist/smoke.js claude "질문" [sessionId]   # 어댑터 단독 스모크 테스트
```

소스는 전부 `src/` 아래에 있습니다:

```
src/
├── index.tsx           # 엔트리포인트 (인자 파싱, 설치 검사, 워커 prewarm)
├── app.tsx             # 메인 App (레이아웃, REPL, 델타 배칭 렌더)
├── orchestrator.ts     # 질문 fan-out + 세션 관리
├── review.ts           # /review 명령 파싱 + 리뷰 프롬프트
├── commands.ts         # 슬래시 명령 자동 완성 목록
├── image.ts            # 이미지 경로 감지 / [Image #N] 표시
├── clipboard.ts        # 클립보드 이미지 추출 (macOS osascript)
├── text.ts             # 전각 폭 반영 줄바꿈/tail 유틸
├── smoke.ts            # 어댑터 검증 스크립트
├── components/         # Panel, PromptInput, HistoryBlock
└── adapters/           # claude/codex/gemini 어댑터 + spawn 헬퍼
```

진행 이력과 설계 결정은 `docs/` 의 plan/progress 문서에 기록되어 있습니다.
