// 질문 입력창 — Enter 제출, Backspace 삭제, /quit 종료는 상위에서 처리
import { Box, Text, useInput } from 'ink';

interface Props {
  value: string;
  disabled: boolean;
  onChange(value: string): void;
  onSubmit(value: string): void;
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
        {value}
        {disabled ? <Text dimColor> (응답 대기 중... 입력 잠금)</Text> : <Text color="cyan">▌</Text>}
      </Text>
    </Box>
  );
}
