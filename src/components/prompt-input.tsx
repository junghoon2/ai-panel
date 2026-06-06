// 질문 입력창 — Enter 제출, Backspace 삭제, /quit 종료는 상위에서 처리
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

/** [Image #N] 토큰만 색을 입혀 렌더링 */
function InputDisplay({ value }: { value: string }) {
  const { display } = replaceImagePathsForDisplay(value);
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

  // 후보를 입력창에 채워 넣는다 — 인자를 이어서 칠 수 있게 뒤에 공백 추가
  const complete = (name: string) => {
    onChange(`${name} `);
    setSelected(0);
  };

  useInput((input, key) => {
    if (disabled) return;

    // 자동 완성이 열려 있을 때의 키 처리
    if (suggestions.length > 0) {
      if (key.tab) {
        complete(suggestions[sel].name);
        return;
      }
      if (key.downArrow || key.rightArrow) {
        setSelected((sel + 1) % suggestions.length);
        return;
      }
      if (key.upArrow || key.leftArrow) {
        setSelected((sel - 1 + suggestions.length) % suggestions.length);
        return;
      }
      // 아직 완성 전이면 Enter 는 제출 대신 완성 — 이미 완전한 명령이면 그대로 제출
      if (key.return && suggestions[sel].name !== value) {
        complete(suggestions[sel].name);
        return;
      }
    }

    if (key.return) {
      onSubmit(value);
      setSelected(0);
      return;
    }
    if (key.ctrl && input === 'v') {
      onPasteImage();
      return;
    }
    if (key.backspace || key.delete) {
      onChange(value.slice(0, -1));
      return;
    }
    if (!input || key.ctrl || key.meta || key.escape) return;

    // 붙여넣기 등으로 텍스트와 개행이 한 청크로 들어오면 key.return 이 잡히지 않으므로
    // 개행 앞까지를 입력으로 보고 즉시 제출한다
    const nl = input.search(/[\r\n]/);
    if (nl >= 0) {
      onSubmit(value + input.slice(0, nl));
    } else {
      onChange(value + input);
    }
  });

  return (
    <Box flexDirection="column">
      <Box borderStyle="round" paddingX={1}>
        <Text>
          <Text color="cyan">{'> '}</Text>
          <InputDisplay value={value} />
          {disabled ? <Text dimColor> (응답 대기 중... 입력 잠금)</Text> : <Text color="cyan">▌</Text>}
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
          ' '
        )}
      </Text>
    </Box>
  );
}
