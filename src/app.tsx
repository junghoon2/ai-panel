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
  tools: AdapterName[];
}

function initialPanels(tools: AdapterName[]): Record<string, PanelState> {
  return Object.fromEntries(tools.map((t) => [t, { status: 'idle', text: '' } as PanelState]));
}

export function App({ tools }: Props) {
  const { exit } = useApp();
  const { stdout } = useStdout();

  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [lastQuestion, setLastQuestion] = useState('');
  const [, setTick] = useState(0); // 강제 리렌더용
  const forceRender = () => setTick((t) => t + 1);

  const panelsRef = useRef<Record<string, PanelState>>(initialPanels(tools));
  const sessionsRef = useRef<SessionMap>({}); // 도구별 resume 세션 (2번째 질문부터 사용)

  // busy 동안 100ms 간격으로 리렌더 — 델타 배칭 + 경과 시간 갱신
  useEffect(() => {
    if (!busy) return;
    const id = setInterval(forceRender, 100);
    return () => clearInterval(id);
  }, [busy]);

  const submit = (raw: string) => {
    const question = raw.trim();
    if (!question || busy) return;
    if (question === '/quit' || question === '/q') {
      exit();
      return;
    }

    setInput('');
    setLastQuestion(question);
    setBusy(true);

    runQuestion(tools, question, sessionsRef.current, {
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
  const panelInnerLines = Math.max(3, rows - 8); // 헤더1 + 입력3 + 패널 테두리2 + 상태줄1 + 여유1

  return (
    <Box flexDirection="column" width={cols} height={rows - 1}>
      <Text>
        <Text bold color="cyan">
          {' ai-panel '}
        </Text>
        <Text dimColor>
          {lastQuestion ? `질문: ${lastQuestion}` : '질문을 입력하세요 (/quit 종료)'}
        </Text>
      </Text>

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
