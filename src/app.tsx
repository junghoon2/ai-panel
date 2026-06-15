// 메인 App — 3분할 패널 레이아웃 + REPL 입력 루프
//
// 렌더링 전략: 델타마다 setState 하면 리렌더 폭주로 화면이 깜빡이므로,
// 패널 상태는 ref 에 직접 누적하고 busy 동안 100ms 간격 tick 으로만 리렌더한다.
import { Box, Static, Text, useApp, useInput, useStdout } from 'ink';
import { useEffect, useRef, useState } from 'react';
import type { AdapterName } from './adapters/types.js';
import { adapters } from './adapters/index.js';
import {
  runTasks,
  type AgentTask,
  type RunController,
  type RunHandlers,
  type SessionMap,
} from './orchestrator.js';
import { buildReviewPrompt, parseReviewCommand } from './review.js';
import { SLASH_COMMANDS, parseWritePermissionIntent } from './commands.js';
import { extractImagePaths } from './image.js';
import { clipboardImageToFile } from './clipboard.js';
import { Panel, type PanelState } from './components/panel.js';
import { wrapToWidth } from './text.js';
import { PromptInput } from './components/prompt-input.js';
import { HistoryBlock, type HistoryEntry } from './components/history.js';

// 파일 쓰기 권한을 지원하는 도구 — "/claude 쓰기 권한 추가해줘" 같은 요청의 토글 대상 (gemini 제외)
const WRITE_CAPABLE_TOOLS: AdapterName[] = ['claude', 'codex'];

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
  const [focus, setFocus] = useState<AdapterName | null>(null); // 특정 도구 전용 모드 (/claude 등)
  const [writeTools, setWriteTools] = useState<AdapterName[]>([]); // 쓰기 권한이 켜진 도구 (기본 전부 읽기 전용)
  const [header, setHeader] = useState(''); // 상단 표시 (질문: ... / 리뷰: ...)
  const [notice, setNotice] = useState(''); // 명령 피드백 (오류·안내) 표시줄
  const [history, setHistory] = useState<HistoryEntry[]>([]); // 지나간 턴 (스크롤백 보존)
  const [scrollOffset, setScrollOffset] = useState(0); // 현재 턴 패널을 맨 아래(최신)에서 위로 거슬러 본 줄 수
  const [, setTick] = useState(0); // 강제 리렌더용
  const forceRender = () => setTick((t) => t + 1);

  const panelsRef = useRef<Record<string, PanelState>>(initialPanels(tools, missing));
  const sessionsRef = useRef<SessionMap>({}); // 도구별 resume 세션 (2번째 질문부터 사용)

  // 교차 리뷰용 — 마지막 "일반 질문" 턴의 질문과 도구별 답변 (리뷰 턴은 갱신하지 않음)
  const lastUserQuestionRef = useRef('');
  const lastAnswersRef = useRef<Partial<Record<AdapterName, string>>>({});

  // 질문을 실제로 보낼 도구 (미설치 제외)
  const activeTools = tools.filter((t) => !missing.includes(t));

  const cols = stdout?.columns ?? 80;
  const rows = stdout?.rows ?? 24;
  // 패널 내부 표시 영역 계산 (테두리/패딩 근사 보정)
  const panelInnerWidth = Math.max(10, Math.floor(cols / tools.length) - 4);
  const panelInnerLines = Math.max(3, rows - 10); // 헤더1 + notice1 + 입력3 + 자동완성1 + 패널 테두리2 + 상태줄1 + 여유1

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

  // 진행 중인 턴의 취소 핸들 + Ctrl+C 더블 입력 추적 + 제출한 질문 히스토리(↑↓ 재호출용)
  const controllerRef = useRef<RunController | null>(null);
  const lastCtrlCRef = useRef(0);
  const questionHistoryRef = useRef<string[]>([]);
  // 응답 생성 중 제출한 메시지 — 큐에 쌓아두고 턴이 끝나면 순서대로 자동 전송한다
  const queueRef = useRef<string[]>([]);

  // 세 패널 중 가장 긴 응답 기준 스크롤 가능한 최대 줄 수 (현재 턴 텍스트 기준)
  const maxScrollOffset = () =>
    Math.max(
      0,
      ...activeTools.map(
        (t) => wrapToWidth(panelsRef.current[t]?.text ?? '', panelInnerWidth).length - panelInnerLines,
      ),
    );
  const scrollPage = Math.max(1, panelInnerLines - 1); // Shift+↑↓ 한 번에 거의 한 화면

  // Ctrl+C / ESC — Claude Code 와 동일한 동작:
  //   응답 중: 턴 중단 | 입력 있음: 입력 비우기 | 입력 없음(Ctrl+C): 2초 안에 한 번 더 → 종료
  // Shift+↑/↓ 는 세 패널을 함께 위/아래로 스크롤한다 (맨 아래 = 최신 응답 끝).
  // 입력창의 단독 ↑↓(히스토리·줄이동)와 구분되며, prompt-input 은 Shift 조합을 무시한다.
  useInput((char, key) => {
    if (key.upArrow && key.shift) {
      setScrollOffset((o) => Math.min(maxScrollOffset(), o + scrollPage));
      return;
    }
    if (key.downArrow && key.shift) {
      setScrollOffset((o) => Math.max(0, o - scrollPage));
      return;
    }

    const isCtrlC = key.ctrl && char === 'c';
    if (!isCtrlC && !key.escape) return;

    // 위로 스크롤해 둔 상태면 Esc 는 먼저 최신(맨 아래)으로 복귀
    if (key.escape && scrollOffset > 0) {
      setScrollOffset(0);
      return;
    }

    if (busy) {
      controllerRef.current?.cancel();
      setNotice('응답을 중단했습니다.');
      return;
    }
    if (input) {
      setInput('');
      if (isCtrlC) lastCtrlCRef.current = Date.now();
      return;
    }
    if (isCtrlC) {
      if (Date.now() - lastCtrlCRef.current < 2000) {
        exit();
        return;
      }
      lastCtrlCRef.current = Date.now();
      setNotice('한 번 더 Ctrl+C 를 누르면 종료합니다.');
    }
  });

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
    setScrollOffset(0); // 새 턴은 항상 맨 아래(최신)에서 시작
    setNotice('');
    setHeader(headerText);
    setBusy(true);
    controllerRef.current = runTasks(tasks, sessionsRef.current, makeHandlers(recordAnswers));
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

  // 일반 질문 1건을 지정한 도구들에게 전송하는 공통 경로
  // (이미지 경로 감지 포함 — 전체 질문과 /claude 등 단일 도구 질문이 공유)
  const sendQuestion = (targets: AdapterName[], raw: string) => {
    const { question: text, images } = extractImagePaths(raw);
    // 이미지만 던진 경우 기본 지시문을 붙인다
    const finalText = text || (images.length > 0 ? '첨부한 이미지를 설명해줘' : '');
    if (!finalText) return;

    lastUserQuestionRef.current = finalText;
    // 일부 도구에게만 가는 턴은 헤더에 대상 표시. 여러 줄 질문은 헤더에서 한 줄로 정리
    const tag = targets.length < activeTools.length ? `[${targets.join(',')}] ` : '';
    const headerText = finalText.replace(/\s*\n\s*/g, ' ');
    startTurn(
      `질문: ${tag}${headerText}${images.length > 0 ? ` (이미지 ${images.length}장)` : ''}`,
      targets.map((name) => ({ name, question: finalText, images })),
      true,
    );
  };

  const submit = (raw: string) => {
    const question = raw.trim();
    if (!question) return;

    // 응답 생성 중이면 곧장 처리하지 않고 큐에 적재 — 턴이 끝나면 drain 이 다시 submit 한다
    if (busy) {
      queueRef.current.push(question);
      setInput('');
      forceRender();
      return;
    }

    // ↑↓ 로 다시 불러올 수 있게 제출한 줄을 히스토리에 보관 (연속 중복 제외)
    if (questionHistoryRef.current.at(-1) !== question) {
      questionHistoryRef.current.push(question);
    }

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

    // /claude /codex /gemini — 해당 도구에게만 질문 (인자 없으면 전용 모드 전환)
    const toolCmd = tools.find((t) => question === `/${t}` || question.startsWith(`/${t} `));
    if (toolCmd) {
      if (missing.includes(toolCmd)) {
        setNotice(`${toolCmd} CLI 가 미설치라 사용할 수 없습니다.`);
        return;
      }
      const rest = question.slice(toolCmd.length + 1).trim();
      if (!rest) {
        setFocus(toolCmd);
        setNotice(`${toolCmd} 전용 모드 — 이후 질문이 ${toolCmd} 에게만 전송됩니다 (/all 로 해제)`);
        return;
      }
      // "쓰기 권한 추가해줘" 등 권한 토글 요청은 질문 대신 권한 변경으로 처리 (claude·codex 만, gemini 제외)
      if (WRITE_CAPABLE_TOOLS.includes(toolCmd)) {
        const intent = parseWritePermissionIntent(rest);
        if (intent !== null) {
          adapters[toolCmd].setWriteAccess?.(intent);
          setWriteTools((prev) =>
            intent ? [...prev.filter((t) => t !== toolCmd), toolCmd] : prev.filter((t) => t !== toolCmd),
          );
          setNotice(
            intent
              ? `${toolCmd} 파일 쓰기 권한 켜짐 — 다음 질문부터 파일 생성·편집을 자동 승인합니다 ("${toolCmd} 쓰기 권한 해제"로 끄기).`
              : `${toolCmd} 파일 쓰기 권한 꺼짐 — 읽기 전용으로 복귀했습니다.`,
          );
          return;
        }
      }
      sendQuestion([toolCmd], rest); // 이번 턴만 해당 도구에게
      return;
    }

    // /all — 전용 모드 해제
    if (question === '/all') {
      setFocus(null);
      setNotice('전용 모드 해제 — 다시 모든 도구에게 질문합니다.');
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
      const targets = focus ? [focus] : activeTools; // 전용 모드 존중
      const tag = targets.length < activeTools.length ? `[${targets.join(',')}] ` : '';
      lastUserQuestionRef.current = text;
      startTurn(
        `질문: ${tag}${text} (클립보드 이미지)`,
        targets.map((name) => ({ name, question: text, images: [image] })),
        true,
      );
      return;
    }

    // 오타 등 알 수 없는 슬래시 명령이 질문으로 전송되는 것 방지
    // — 이미지 경로도 / 로 시작하므로 경로 제거 후 "/단어" 형태만 명령으로 간주
    const { question: guardText } = extractImagePaths(question);
    const firstToken = guardText.split(/\s+/)[0] ?? '';
    if (/^\/\w+$/.test(firstToken)) {
      setNotice(`알 수 없는 명령: ${firstToken} — 사용 가능: ${SLASH_COMMANDS.map((c) => c.name).join(', ')}`);
      return;
    }

    // 일반 질문 — 전용 모드(focus)면 해당 도구에게만, 아니면 전체에게
    sendQuestion(focus ? [focus] : activeTools, question);
  };

  // 턴이 끝나(busy=false) 큐에 대기 중인 메시지가 있으면 가장 먼저 들어온 것을 자동 전송한다.
  // submit 이 새 턴을 시작하면 busy 가 다시 true 가 되고, 그 턴이 끝나면 이 effect 가 다음 것을 꺼낸다.
  useEffect(() => {
    if (busy || queueRef.current.length === 0) return;
    const next = queueRef.current.shift();
    if (next) submit(next);
    // eslint 없음 — busy 전이에만 반응하면 되고, submit 은 매 렌더 최신 클로저를 쓴다
  }, [busy]);

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
        {/* 전용 모드 표시 — 어느 도구에게만 가는 상태인지 항상 보이게 */}
        {focus ? (
          <Text bold color="yellow">
            [{focus} 전용]
          </Text>
        ) : null}
        {/* 쓰기 권한이 켜진 도구가 있으면 항상 보이게 — 파일이 수정될 수 있는 상태임을 경고 */}
        {writeTools.length > 0 ? (
          <Text bold color="red">
            {' '}
            [{writeTools.join('·')} 쓰기]
          </Text>
        ) : null}
        <Text dimColor> {header || '질문을 입력하세요 (/exit 종료)'}</Text>
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
            scrollOffset={scrollOffset}
          />
        ))}
      </Box>

        <PromptInput
          value={input}
          busy={busy}
          queuedCount={queueRef.current.length}
          history={questionHistoryRef.current}
          onChange={setInput}
          onSubmit={submit}
          onPasteImage={pasteClipboardImage}
        />
      </Box>
    </>
  );
}
