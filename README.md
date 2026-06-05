# ai-panel

claude / codex / gemini 3개 AI CLI에 **하나의 창에서 한꺼번에 질문**하고, 답변을 3분할 패널로 **실시간 비교**하는 터미널 앱.

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

## 요구 사항

- Node.js 22+
- 아래 CLI 중 1개 이상 설치 및 로그인 완료
  - [Claude Code](https://claude.com/claude-code) (`claude`)
  - [Codex CLI](https://github.com/openai/codex) (`codex`)
  - [Gemini CLI](https://github.com/google-gemini/gemini-cli) (`gemini`)

미설치 도구는 패널에 안내만 표시되고, 나머지 도구로 동작한다.

## 설치

```bash
git clone <repo-url> ai-panel
cd ai-panel
npm install
npm run build
npm link        # 글로벌 명령 등록
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
| `/quit` 또는 `/q` | 종료 |
| Ctrl+C | 종료 |

답변이 진행 중일 때는 입력이 잠긴다 (모든 패널 완료 후 다음 질문 가능).

## 동작 방식

각 CLI를 **비대화형(print/exec) 모드**로 spawn 하고, 구조화된 스트림 출력을 파싱해 공통 이벤트로 정규화한다.

| 도구 | 호출 | 후속 질문 (세션 유지) |
|------|------|----------------------|
| claude | `claude -p --output-format stream-json --include-partial-messages` | `--resume <session-id>` |
| codex | `codex exec --json --skip-git-repo-check` | `codex exec resume <session-id>` |
| gemini | `gemini -p <질문> -o stream-json` | `--resume latest` |

- claude 는 토큰 단위로 스트리밍되고, codex 는 답변이 한 번에 도착한다 (CLI 출력 특성)
- gemini 의 resume 은 세션 id 가 아닌 같은 디렉토리의 최근 세션(latest) 기반
- 도구별 안전망 타임아웃: 120초

## 개발

```bash
npm run build                                  # tsc 빌드 (src/ → dist/)
node dist/smoke.js claude "질문" [sessionId]   # 어댑터 단독 스모크 테스트
```

소스는 전부 `src/` 아래에 있다:

```
src/
├── index.tsx           # 엔트리포인트 (인자 파싱, 설치 검사)
├── app.tsx             # 메인 App (레이아웃, REPL, 델타 배칭 렌더)
├── orchestrator.ts     # 질문 fan-out + 세션 관리
├── text.ts             # 전각 폭 반영 줄바꿈/tail 유틸
├── smoke.ts            # 어댑터 검증 스크립트
├── components/         # Panel, PromptInput
└── adapters/           # claude/codex/gemini 어댑터 + spawn 헬퍼
```
