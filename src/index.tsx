#!/usr/bin/env node
// ai-panel 엔트리포인트 — Phase 1: 최소 Ink 앱 (스캐폴딩 검증용)
import { render, Box, Text } from 'ink';

function App() {
  return (
    <Box borderStyle="round" paddingX={1}>
      <Text color="cyan">Hello ai-panel</Text>
    </Box>
  );
}

render(<App />);
