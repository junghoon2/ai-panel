#!/usr/bin/env node
// ai-panel 엔트리포인트 — claude/codex/gemini 에 한꺼번에 질문하는 3분할 TUI
import { render } from 'ink';
import { App } from './app.js';
import type { AdapterName } from './adapters/types.js';

// 입력창(useInput)이 raw mode 를 요구하므로 TTY 가 아니면 안내 후 종료
if (!process.stdin.isTTY) {
  console.error('ai-panel 은 인터랙티브 터미널(TTY)에서 실행해야 합니다.');
  process.exit(1);
}

const tools: AdapterName[] = ['claude', 'codex', 'gemini'];

render(<App tools={tools} />);
