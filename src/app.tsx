// 메인 App — 3분할 패널 레이아웃 + REPL 입력 루프
//
// 렌더링 전략: 델타마다 setState 하면 리렌더 폭주로 화면이 깜빡이므로,
// 패널 상태는 ref 에 직접 누적하고 busy 동안 100ms 간격 tick 으로만 리렌더한다.
import { Box, Text, useApp, useStdout } from 'ink';
import { useEffect, useRef, useState } from 'react';
import type { AdapterName } from './adapters/types.js';
import { runQuestion, type SessionMap } from './orchestrator.js';
import { Panel, type PanelState } from './components/panel.js';
import { PromptInput } from './components/prompt-input.js';

interface Props {
  /** 패널로 표시할 전체 도구 (미설치 포함) */
  tools: AdapterName[];
  /** 미설치 도구 — 패널에 안내만 표시하고 질문을 보내지 않는다 */
  missing: AdapterName[];
  /** 시작과 동시에 전송할 첫 질문 (CLI 인자) */
  initialQuestion?: string;
}

function initialPanels(tools: AdapterName[], missing: AdapterName[]): Record<string, PanelState> {
  return Object.fromEntries(
    tools.map((t) => [
      t,
      missing.includes(t)
        ? ({ status: 'error', text: '', error: `${t} CLI 미설치 — PATH 에서 찾을 수 없음` } as PanelState)
        : ({ status: 'idle', text: '' } as PanelState),
    ]),
  );
}

export function App({ tools, missing, initialQuestion }: Props) {
  const { exit } = useApp();
  const { stdout } = useStdout();

  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [lastQuestion, setLastQuestion] = useState('');
  const [notice, setNotice] = useState(''); // 명령 피드백 (오류·안내) 표시줄
  const [, setTick] = useState(0); // 강제 리렌더용
  const forceRender = () => setTick((t) => t + 1);

  const panelsRef = useRef<Record<string, PanelState>>(initialPanels(tools, missing));
  const sessionsRef = useRef<SessionMap>({}); // 도구별 resume 세션 (2번째 질문부터 사용)

  // 교차 리뷰용 — 마지막 "일반 질문" 턴의 질문과 도구별 답변 (리뷰 턴은 갱신하지 않음)
  const lastUserQuestionRef = useRef('');
  const lastAnswersRef = useRef<Partial<Record<AdapterName, string>>>({});

  // 질문을 실제로 보낼 도구 (미설치 제외)
  const activeTools = tools.filter((t) => !missing.includes(t));

  // busy 동안 100ms 간격으로 리렌더 — 델타 배칭 + 경과 시간 갱신
  useEffect(() => {
    if (!busy) return;
    const id = setInterval(forceRender, 100);
    return () => clearInterval(id);
  }, [busy]);

  // CLI 인자로 받은 첫 질문은 마운트 직후 1회 전송
  useEffect(() => {
    if (initialQuestion) submit(initialQuestion);
    // eslint 없음 — 마운트 1회 실행 의도
  }, []);

  const submit = (raw: string) => {
    const question = raw.trim();
    if (!question || busy) return;
    // 기본 종료 명령은 /exit (claude 등과 통일), /quit·/q 는 별칭으로 유지
    if (question === '/exit' || question === '/quit' || question === '/q') {
      exit();
      return;
    }

    setInput('');
    setNotice('');
    setLastQuestion(question);
    setBusy(true);
    lastUserQuestionRef.current = question;

    runQuestion(activeTools, question, sessionsRef.current, {
      onStart: (name) => {
        panelsRef.current[name] = { status: 'running', text: '', startedAt: Date.now() };
      },
      onDelta: (name, text) => {
        panelsRef.current[name].text += text;
      },
      onDone: (name) => {
        const p = panelsRef.current[name];
        p.status = 'done';
        p.elapsedMs = Date.now() - (p.startedAt ?? Date.now());
        lastAnswersRef.current[name as AdapterName] = p.text; // 리뷰 대상으로 저장
      },
      onError: (name, error) => {
        const p = panelsRef.current[name];
        p.status = 'error';
        p.error = error;
        p.elapsedMs = Date.now() - (p.startedAt ?? Date.now());
      },
      onAllSettled: () => {
        setBusy(false);
        forceRender();
      },
    });
    forceRender();
  };

  const cols = stdout?.columns ?? 80;
  const rows = stdout?.rows ?? 24;
  // 패널 내부 표시 영역 계산 (테두리/패딩 근사 보정)
  const panelInnerWidth = Math.max(10, Math.floor(cols / tools.length) - 4);
  const panelInnerLines = Math.max(3, rows - 9); // 헤더1 + notice1 + 입력3 + 패널 테두리2 + 상태줄1 + 여유1

  return (
    <Box flexDirection="column" width={cols} height={rows - 1}>
      <Text>
        <Text bold color="cyan">
          {' ai-panel '}
        </Text>
        <Text dimColor>
          {lastQuestion ? `질문: ${lastQuestion}` : '질문을 입력하세요 (/exit 종료)'}
        </Text>
      </Text>

      {/* 레이아웃 흔들림 방지를 위해 notice 줄은 항상 자리를 차지한다 */}
      <Text color="yellow">{notice || ' '}</Text>

      <Box flexGrow={1}>
        {tools.map((t) => (
          <Panel
            key={t}
            name={t}
            state={panelsRef.current[t]}
            innerLines={panelInnerLines}
            innerWidth={panelInnerWidth}
          />
        ))}
      </Box>

      <PromptInput value={input} disabled={busy} onChange={setInput} onSubmit={submit} />
    </Box>
  );
}
