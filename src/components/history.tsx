// 지나간 턴(질문/리뷰 + 도구별 답변)을 터미널 스크롤백에 남기는 히스토리 블록
// Ink <Static> 으로 1회만 출력되어 위로 스크롤하면 이전 대화를 확인할 수 있다
import { Box, Text } from 'ink';

export interface HistoryResult {
  name: string;
  text: string;
  error?: string;
  elapsedMs?: number;
}

export interface HistoryEntry {
  /** 턴 제목 (질문: ... / 리뷰: ...) */
  header: string;
  results: HistoryResult[];
}

export function HistoryBlock({ entry }: { entry: HistoryEntry }) {
  return (
    <Box flexDirection="column" marginBottom={1}>
      <Text bold color="cyan">
        ── {entry.header}
      </Text>
      {entry.results.map((r) => (
        <Box key={r.name} flexDirection="column" marginTop={1}>
          <Text>
            <Text bold color={r.error ? 'red' : 'green'}>
              [{r.name}]
            </Text>
            {r.elapsedMs !== undefined ? <Text dimColor> {(r.elapsedMs / 1000).toFixed(1)}s</Text> : null}
          </Text>
          <Text color={r.error ? 'red' : undefined}>{r.error ? `오류: ${r.error}` : r.text}</Text>
        </Box>
      ))}
    </Box>
  );
}
