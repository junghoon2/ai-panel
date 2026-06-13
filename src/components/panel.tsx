// 도구별 답변 패널 — 상태 표시줄 + 스트리밍 텍스트(tail, PageUp/Down 으로 위로 거슬러 보기)
import { Box, Text } from 'ink';
import { wrapToWidth } from '../text.js';

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
  /** 맨 아래(최신)에서 위로 거슬러 올라간 줄 수 — PageUp/Down 으로 세 패널 공통 조절 */
  scrollOffset: number;
}

export function Panel({ name, state, innerLines, innerWidth, scrollOffset }: Props) {
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

  // 표시 폭 기준 전체 줄에서 스크롤 위치만큼 거슬러 올라가 innerLines 만큼만 보여준다.
  // 공통 scrollOffset 은 패널마다 길이가 달라 여기서 각자 clamp 한다 (짧은 패널은 위쪽이 비는 대신 안전).
  const lines = wrapToWidth(body, innerWidth);
  const maxOffset = Math.max(0, lines.length - innerLines);
  const offset = Math.min(scrollOffset, maxOffset);
  const end = lines.length - offset;
  const start = Math.max(0, end - innerLines);
  const visible = lines.slice(start, end).join('\n');
  const above = start; // 위로 가려진 줄
  const below = lines.length - end; // 아래로 가려진 줄

  return (
    <Box flexDirection="column" flexGrow={1} flexBasis={0} borderStyle="round" paddingX={1}>
      <Text>
        <Text color={color}>{icon}</Text> <Text bold>{name}</Text>
        {elapsed ? <Text dimColor> {elapsed}</Text> : null}
        {/* 스크롤로 가려진 줄이 있으면 위/아래 남은 양을 표시 */}
        {above > 0 || below > 0 ? (
          <Text color="cyan">
            {' '}
            {above > 0 ? `▲${above}` : ''}
            {above > 0 && below > 0 ? ' ' : ''}
            {below > 0 ? `▼${below}` : ''}
          </Text>
        ) : null}
      </Text>
      {/* wrapToWidth 가 표시 폭 기준으로 이미 줄바꿈하므로 Ink 의 재줄바꿈은 발생하지 않는다 */}
      <Text color={state.status === 'error' ? 'red' : undefined}>{visible}</Text>
    </Box>
  );
}
