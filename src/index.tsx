#!/usr/bin/env node
// ai-panel 엔트리포인트 — claude/codex/gemini 에 한꺼번에 질문하는 3분할 TUI
//
// 사용법:
//   ai-panel                          # 빈 화면으로 시작, 질문 입력
//   ai-panel "첫 질문"                 # 시작과 동시에 첫 질문 전송
//   ai-panel --only claude,gemini     # 선택한 도구만 사용
import { spawnSync } from 'node:child_process';
import { render } from 'ink';
import { App } from './app.js';
import type { AdapterName } from './adapters/types.js';

const ALL_TOOLS: AdapterName[] = ['claude', 'codex', 'gemini'];

function printUsageAndExit(code: number): never {
  console.error('사용법: ai-panel [--only claude,codex,gemini] ["첫 질문"]');
  process.exit(code);
}

// --- 인자 파싱 (의존성 없이 최소한으로) ---
const argv = process.argv.slice(2);
let selected = ALL_TOOLS;
let initialQuestion: string | undefined;

for (let i = 0; i < argv.length; i += 1) {
  const arg = argv[i];
  if (arg === '--help' || arg === '-h') {
    printUsageAndExit(0);
  } else if (arg === '--only' || arg.startsWith('--only=')) {
    const value = arg.includes('=') ? arg.split('=')[1] : argv[++i];
    if (!value) printUsageAndExit(1);
    const names = value.split(',').map((s) => s.trim()) as AdapterName[];
    const invalid = names.filter((n) => !ALL_TOOLS.includes(n));
    if (invalid.length > 0) {
      console.error(`알 수 없는 도구: ${invalid.join(', ')} (사용 가능: ${ALL_TOOLS.join(', ')})`);
      process.exit(1);
    }
    selected = names;
  } else if (!arg.startsWith('-') && initialQuestion === undefined) {
    initialQuestion = arg;
  } else {
    printUsageAndExit(1);
  }
}

// --- 실행 환경 검사 ---
if (!process.stdin.isTTY) {
  // 입력창(useInput)이 raw mode 를 요구한다
  console.error('ai-panel 은 인터랙티브 터미널(TTY)에서 실행해야 합니다.');
  process.exit(1);
}

// 설치 여부 검사 — 미설치 도구는 패널에 안내만 표시하고 나머지로 동작
const missing = selected.filter((t) => spawnSync('which', [t], { stdio: 'ignore' }).status !== 0);
const available = selected.filter((t) => !missing.includes(t));

if (available.length === 0) {
  console.error(`사용 가능한 CLI 가 없습니다. 설치를 확인하세요: ${selected.join(', ')}`);
  process.exit(1);
}

// 상시 유지 워커를 지원하는 도구는 미리 기동해 첫 질문 지연을 줄인다
const { adapters } = await import('./adapters/index.js');
for (const t of available) adapters[t].prewarm?.();

const app = render(<App tools={selected} missing={missing} initialQuestion={initialQuestion} />);

// /exit 등으로 언마운트되면 상시 워커를 정리해 프로세스가 정상 종료되게 한다
await app.waitUntilExit();
for (const t of available) adapters[t].dispose?.();
