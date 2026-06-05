// 도구별 답변 패널 — 상태 표시줄 + 스트리밍 텍스트(tail)
import { Box, Text } from 'ink';
import { tailLines } from '../text.js';

export type PanelStatus = 'idle' | 'running' | 'done' | 'error';

export interface PanelState {
  status: PanelStatus;
  text: string;
  error?: string;
  /** 질문 시작 시각 (ms) — 경과 시간 표시용 */
  startedAt?: number;
  /** done/error 시점의 소요 시간 (ms) */
  elapsedMs?: number;
}

const STATUS_ICON: Record<PanelStatus, { icon: string; color: string }> = {
  idle: { icon: '○', color: 'gray' },
  running: { icon: '◐', color: 'yellow' },
  done: { icon: '✔', color: 'green' },
  error: { icon: '✖', color: 'red' },
};

interface Props {
  name: string;
  state: PanelState;
  /** 패널 내부에 표시 가능한 텍스트 줄 수 */
  innerLines: number;
  /** 패널 내부 텍스트 너비 (칸 수) */
  innerWidth: number;
}

export function Panel({ name, state, innerLines, innerWidth }: Props) {
  const { icon, color } = STATUS_ICON[state.status];

  const elapsed =
    state.elapsedMs !== undefined
      ? `${(state.elapsedMs / 1000).toFixed(1)}s`
      : state.startedAt
        ? `${((Date.now() - state.startedAt) / 1000).toFixed(0)}s`
        : '';

  const body =
    state.status === 'error'
      ? `오류: ${state.error ?? ''}`
      : state.text || (state.status === 'running' ? '응답 대기 중...' : '');

  return (
    <Box flexDirection="column" flexGrow={1} flexBasis={0} borderStyle="round" paddingX={1}>
      <Text>
        <Text color={color}>{icon}</Text> <Text bold>{name}</Text>
        {elapsed ? <Text dimColor> {elapsed}</Text> : null}
      </Text>
      {/* tailLines 가 표시 폭 기준으로 이미 줄바꿈하므로 Ink 의 재줄바꿈은 발생하지 않는다 */}
      <Text color={state.status === 'error' ? 'red' : undefined}>
        {tailLines(body, innerWidth, innerLines)}
      </Text>
    </Box>
  );
}
