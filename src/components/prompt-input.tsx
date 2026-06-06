// 질문 입력창 — Enter 제출, ←→↑↓ 커서 이동·중간 수정, 여러 줄 입력 지원
// 줄바꿈: Shift+Enter(CSI-u 지원 터미널) · Option+Enter · "\" 입력 후 Enter
// 이미지 경로가 감지되면 [Image #N] 칩으로 표시해 첨부 여부를 알 수 있게 한다
// "/" 로 시작하면 슬래시 명령 자동 완성 후보를 표시한다 (↑↓ 선택, Tab/Enter 완성)
import { Box, Text, useInput } from 'ink';
import { useState } from 'react';
import { matchSlashCommands } from '../commands.js';
import { replaceImagePathsForDisplay } from '../image.js';

interface Props {
  value: string;
  disabled: boolean;
  onChange(value: string): void;
  onSubmit(value: string): void;
  /** Ctrl+V — 클립보드 이미지 붙여넣기 (Cmd+V 는 터미널이 가로채 앱에 전달되지 않음) */
  onPasteImage(): void;
}

/** [Image #N] 토큰만 색을 입히고, 커서 위치에 ▌ 를 그린다 */
function InputDisplay({ value, cursor, showCursor }: { value: string; cursor: number; showCursor: boolean }) {
  // 커서 앞/뒤를 따로 치환해 커서가 칩 번호를 깨지 않게 한다 (번호는 이어서 매김)
  const before = replaceImagePathsForDisplay(value.slice(0, cursor));
  const after = replaceImagePathsForDisplay(value.slice(cursor), before.count);
  const display = `${before.display}${showCursor ? '▌' : ''}${after.display}`;

  const parts = display.split(/(\[Image #\d+\])/);
  return (
    <>
      {parts.map((part, i) =>
        /^\[Image #\d+\]$/.test(part) ? (
          <Text key={i} color="magenta" bold>
            {part}
          </Text>
        ) : (
          <Text key={i}>{part}</Text>
        ),
      )}
    </>
  );
}

export function PromptInput({ value, disabled, onChange, onSubmit, onPasteImage }: Props) {
  // 자동 완성 후보 — value 에서 매번 파생하고, 선택 위치만 상태로 가진다
  const suggestions = disabled ? [] : matchSlashCommands(value);
  const [selected, setSelected] = useState(0);
  // 입력이 바뀌어 후보가 줄어도 선택 위치가 범위를 벗어나지 않게 보정
  const sel = Math.min(selected, Math.max(0, suggestions.length - 1));

  // 커서 위치 — 외부에서 value 가 바뀌어도(초기화 등) 범위를 벗어나지 않게 보정
  const [cursorState, setCursorState] = useState(0);
  const cursor = Math.min(cursorState, value.length);

  /** 커서 위치에 문자열 삽입 */
  const insertAt = (s: string) => {
    onChange(value.slice(0, cursor) + s + value.slice(cursor));
    setCursorState(cursor + s.length);
  };

  // 후보를 입력창에 채워 넣는다 — 인자를 이어서 칠 수 있게 뒤에 공백 추가
  const complete = (name: string) => {
    onChange(`${name} `);
    setCursorState(name.length + 1);
    setSelected(0);
  };

  /** ↑↓ — 여러 줄 입력에서 줄 사이 커서 이동 (열 위치 유지) */
  const moveLine = (dir: -1 | 1) => {
    const lineStart = value.lastIndexOf('\n', cursor - 1) + 1;
    const col = cursor - lineStart;
    if (dir === -1) {
      if (lineStart === 0) return; // 첫 줄
      const prevStart = value.lastIndexOf('\n', lineStart - 2) + 1;
      setCursorState(Math.min(prevStart + col, lineStart - 1));
    } else {
      const lineEnd = value.indexOf('\n', cursor);
      if (lineEnd === -1) return; // 마지막 줄
      const nextStart = lineEnd + 1;
      const nextEnd = value.indexOf('\n', nextStart);
      const nextLen = (nextEnd === -1 ? value.length : nextEnd) - nextStart;
      setCursorState(nextStart + Math.min(col, nextLen));
    }
  };

  useInput((input, key) => {
    if (disabled) return;

    // 자동 완성이 열려 있을 때 — ↑↓ 는 후보 선택 (←→ 는 커서 이동에 양보)
    if (suggestions.length > 0) {
      if (key.tab) {
        complete(suggestions[sel].name);
        return;
      }
      if (key.downArrow) {
        setSelected((sel + 1) % suggestions.length);
        return;
      }
      if (key.upArrow) {
        setSelected((sel - 1 + suggestions.length) % suggestions.length);
        return;
      }
      // 아직 완성 전이면 Enter 는 제출 대신 완성 — 이미 완전한 명령이면 그대로 제출
      if (key.return && suggestions[sel].name !== value) {
        complete(suggestions[sel].name);
        return;
      }
    }

    // 줄바꿈 — Shift+Enter(지원 터미널) / Option+Enter / "\" + Enter
    if (key.return && (key.shift || key.meta)) {
      insertAt('\n');
      return;
    }
    if (input === '[13;2u') {
      // CSI-u(kitty 프로토콜) 터미널이 보내는 Shift+Enter 원시 시퀀스
      insertAt('\n');
      return;
    }
    if (key.return && cursor > 0 && value[cursor - 1] === '\\') {
      // 직전의 \ 를 줄바꿈으로 치환
      onChange(value.slice(0, cursor - 1) + '\n' + value.slice(cursor));
      return;
    }
    if (key.return) {
      onSubmit(value);
      setSelected(0);
      setCursorState(0);
      return;
    }

    if (key.ctrl && input === 'v') {
      onPasteImage();
      return;
    }

    // 커서 이동·삭제
    if (key.leftArrow) {
      setCursorState(Math.max(0, cursor - 1));
      return;
    }
    if (key.rightArrow) {
      setCursorState(Math.min(value.length, cursor + 1));
      return;
    }
    if (key.upArrow) {
      moveLine(-1);
      return;
    }
    if (key.downArrow) {
      moveLine(1);
      return;
    }
    if (key.backspace || key.delete) {
      if (cursor === 0) return;
      onChange(value.slice(0, cursor - 1) + value.slice(cursor));
      setCursorState(cursor - 1);
      return;
    }

    if (!input || key.ctrl || key.meta || key.escape) return;

    // 일반 입력 — 붙여넣기 청크의 개행은 제출이 아니라 줄바꿈으로 삽입한다
    insertAt(input.replace(/\r\n?/g, '\n'));
  });

  return (
    <Box flexDirection="column">
      <Box borderStyle="round" paddingX={1}>
        <Text>
          <Text color="cyan">{'> '}</Text>
          <InputDisplay value={value} cursor={cursor} showCursor={!disabled} />
          {disabled ? <Text dimColor> (응답 대기 중... 입력 잠금)</Text> : null}
        </Text>
      </Box>
      {/* 레이아웃 흔들림 방지를 위해 자동 완성 줄은 항상 자리를 차지한다 (notice 줄과 동일 패턴) */}
      <Text>
        {suggestions.length > 0 ? (
          <>
            {suggestions.map((s, i) => (
              <Text key={s.name}>
                {i === sel ? (
                  <Text color="cyan" inverse>
                    {` ${s.name} `}
                  </Text>
                ) : (
                  <Text dimColor>{` ${s.name} `}</Text>
                )}
              </Text>
            ))}
            <Text dimColor> {suggestions[sel].description} · Tab/Enter 완성</Text>
          </>
        ) : (
          <Text dimColor> 줄바꿈: \+Enter 또는 Option+Enter</Text>
        )}
      </Text>
    </Box>
  );
}
