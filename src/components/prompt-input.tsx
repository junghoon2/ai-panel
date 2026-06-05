// 질문 입력창 — Enter 제출, Backspace 삭제, /quit 종료는 상위에서 처리
// 이미지 경로가 감지되면 [Image #N] 칩으로 표시해 첨부 여부를 알 수 있게 한다
import { Box, Text, useInput } from 'ink';
import { replaceImagePathsForDisplay } from '../image.js';

interface Props {
  value: string;
  disabled: boolean;
  onChange(value: string): void;
  onSubmit(value: string): void;
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

export function PromptInput({ value, disabled, onChange, onSubmit }: Props) {
  useInput((input, key) => {
    if (disabled) return;
    if (key.return) {
      onSubmit(value);
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
    <Box borderStyle="round" paddingX={1}>
      <Text>
        <Text color="cyan">{'> '}</Text>
        <InputDisplay value={value} />
        {disabled ? <Text dimColor> (응답 대기 중... 입력 잠금)</Text> : <Text color="cyan">▌</Text>}
      </Text>
    </Box>
  );
}
