// 메인 App — 3분할 패널 레이아웃 + REPL 입력 루프
//
// 렌더링 전략: 델타마다 setState 하면 리렌더 폭주로 화면이 깜빡이므로,
// 패널 상태는 ref 에 직접 누적하고 busy 동안 100ms 간격 tick 으로만 리렌더한다.
import { Box, Static, Text, useApp, useStdout } from 'ink';
import { useEffect, useRef, useState } from 'react';
import type { AdapterName } from './adapters/types.js';
import { runTasks, type AgentTask, type RunHandlers, type SessionMap } from './orchestrator.js';
import { buildReviewPrompt, parseReviewCommand } from './review.js';
import { extractImagePaths } from './image.js';
import { clipboardImageToFile } from './clipboard.js';
import { Panel, type PanelState } from './components/panel.js';
import { PromptInput } from './components/prompt-input.js';
import { HistoryBlock, type HistoryEntry } from './components/history.js';

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
  const [header, setHeader] = useState(''); // 상단 표시 (질문: ... / 리뷰: ...)
  const [notice, setNotice] = useState(''); // 명령 피드백 (오류·안내) 표시줄
  const [history, setHistory] = useState<HistoryEntry[]>([]); // 지나간 턴 (스크롤백 보존)
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

  // 공통 실행 핸들러 — 일반 질문 턴만 답변을 리뷰 대상(lastAnswers)으로 기록한다
  const makeHandlers = (recordAnswers: boolean): RunHandlers => ({
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
      if (recordAnswers) lastAnswersRef.current[name] = p.text;
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

  // 현재 턴에 참여한 도구들 — 턴 보존 시 참여하지 않은 패널(이전 답변)이 중복 기록되는 것 방지
  const currentTurnToolsRef = useRef<AdapterName[]>([]);

  // 직전 턴을 히스토리로 보존 (Static 으로 스크롤백에 1회 출력됨)
  const archivePreviousTurn = () => {
    if (!header) return; // 첫 턴 전에는 보존할 것이 없다
    const results = currentTurnToolsRef.current.map((name) => {
      const p = panelsRef.current[name];
      return { name, text: p.text, error: p.error, elapsedMs: p.elapsedMs };
    });
    if (results.length > 0) setHistory((h) => [...h, { header, results }]);
  };

  // 직전 턴 보존 → 새 턴 시작 공통 경로
  const startTurn = (headerText: string, tasks: AgentTask[], recordAnswers: boolean) => {
    archivePreviousTurn();
    currentTurnToolsRef.current = tasks.map((t) => t.name);
    setNotice('');
    setHeader(headerText);
    setBusy(true);
    runTasks(tasks, sessionsRef.current, makeHandlers(recordAnswers));
    forceRender();
  };

  // /review <리뷰어> <대상> — 리뷰어 세션을 이어서 대상 답변을 리뷰
  const handleReview = (line: string) => {
    const cmd = parseReviewCommand(line, tools);
    if (cmd.kind === 'error') {
      setNotice(cmd.message);
      return;
    }
    if (cmd.kind === 'all') {
      // 각 도구가 나머지 도구들의 답변을 교차 리뷰 (답변 없는 도구는 대상에서 제외)
      const tasks: AgentTask[] = [];
      for (const reviewer of activeTools) {
        const targets = activeTools
          .filter((t) => t !== reviewer)
          .map((t) => ({ name: t, answer: lastAnswersRef.current[t] }))
          .filter((t): t is { name: AdapterName; answer: string } => Boolean(t.answer));
        if (targets.length > 0) {
          tasks.push({
            name: reviewer,
            question: buildReviewPrompt(lastUserQuestionRef.current, targets),
          });
        }
      }
      if (tasks.length === 0) {
        setNotice('리뷰할 답변이 없습니다. 먼저 질문을 보내세요.');
        return;
      }

      startTurn('리뷰: all (교차 리뷰)', tasks, false);
      return;
    }

    const { reviewer, target } = cmd;
    if (missing.includes(reviewer)) {
      setNotice(`${reviewer} CLI 가 미설치라 리뷰어로 사용할 수 없습니다.`);
      return;
    }
    const answer = lastAnswersRef.current[target];
    if (!answer) {
      setNotice(`${target} 의 답변이 없습니다. 먼저 질문을 보내세요.`);
      return;
    }

    startTurn(`리뷰: ${reviewer} ← ${target}`, [
      { name: reviewer, question: buildReviewPrompt(lastUserQuestionRef.current, [{ name: target, answer }]) },
    ], false);
  };

  // Ctrl+V — 클립보드 이미지를 임시 파일로 꺼내 입력창에 경로로 삽입한다
  // (경로는 입력창에서 [Image #N] 칩으로 표시되고, 제출 시 기존 감지 로직이 첨부한다)
  const pasteClipboardImage = () => {
    const image = clipboardImageToFile();
    if (!image) {
      setNotice('클립보드에 이미지가 없습니다. Cmd+Ctrl+Shift+4 로 캡처한 뒤 Ctrl+V 하세요.');
      return;
    }
    setNotice('');
    setInput((v) => `${v}${v && !v.endsWith(' ') ? ' ' : ''}${image} `);
  };

  const submit = (raw: string) => {
    const question = raw.trim();
    if (!question || busy) return;
    // 기본 종료 명령은 /exit (claude 등과 통일), /quit·/q 는 별칭으로 유지
    if (question === '/exit' || question === '/quit' || question === '/q') {
      exit();
      return;
    }

    setInput('');

    if (question === '/review' || question.startsWith('/review ')) {
      handleReview(question);
      return;
    }

    // /paste [질문] — 클립보드 이미지를 임시 파일로 꺼내 첨부 (파일 저장 없이)
    if (question === '/paste' || question.startsWith('/paste ')) {
      const image = clipboardImageToFile();
      if (!image) {
        setNotice('클립보드에 이미지가 없습니다. Cmd+Ctrl+Shift+4 로 캡처한 뒤 다시 시도하세요.');
        return;
      }
      const text = question.slice('/paste'.length).trim() || '첨부한 이미지를 설명해줘';
      lastUserQuestionRef.current = text;
      startTurn(
        `질문: ${text} (클립보드 이미지)`,
        activeTools.map((name) => ({ name, question: text, images: [image] })),
        true,
      );
      return;
    }

    // 질문에 이미지 파일 경로가 있으면 분리해 도구별 네이티브 방식으로 첨부한다
    // (이미지 경로도 / 로 시작하므로 명령 오타 가드보다 먼저 처리해야 한다)
    const { question: text, images } = extractImagePaths(question);

    // 오타 등 알 수 없는 슬래시 명령이 질문으로 전송되는 것 방지
    // — "/단어" 형태만 명령으로 간주 (경로는 / 가 더 포함되므로 해당 없음)
    const firstToken = text.split(/\s+/)[0] ?? '';
    if (/^\/\w+$/.test(firstToken)) {
      setNotice(`알 수 없는 명령: ${firstToken} — 사용 가능: /paste, /review, /exit`);
      return;
    }
    // 이미지만 던진 경우 기본 지시문을 붙인다
    const finalText = text || (images.length > 0 ? '첨부한 이미지를 설명해줘' : '');
    if (!finalText) return;

    lastUserQuestionRef.current = finalText;
    startTurn(
      `질문: ${finalText}${images.length > 0 ? ` (이미지 ${images.length}장)` : ''}`,
      activeTools.map((name) => ({ name, question: finalText, images })),
      true,
    );
  };

  const cols = stdout?.columns ?? 80;
  const rows = stdout?.rows ?? 24;
  // 패널 내부 표시 영역 계산 (테두리/패딩 근사 보정)
  const panelInnerWidth = Math.max(10, Math.floor(cols / tools.length) - 4);
  const panelInnerLines = Math.max(3, rows - 9); // 헤더1 + notice1 + 입력3 + 패널 테두리2 + 상태줄1 + 여유1

  return (
    <>
      {/* 지나간 턴은 Static 으로 스크롤백에 남는다 — 위로 스크롤하면 이전 대화 확인 가능 */}
      <Static items={history}>
        {(entry, index) => <HistoryBlock key={index} entry={entry} />}
      </Static>

      <Box flexDirection="column" width={cols} height={rows - 1}>
      <Text>
        <Text bold color="cyan">
          {' ai-panel '}
        </Text>
        <Text dimColor>{header || '질문을 입력하세요 (/exit 종료)'}</Text>
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

        <PromptInput
          value={input}
          disabled={busy}
          onChange={setInput}
          onSubmit={submit}
          onPasteImage={pasteClipboardImage}
        />
      </Box>
    </>
  );
}
