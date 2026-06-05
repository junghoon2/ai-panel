// 어댑터 단독 검증용 스모크 스크립트 (TUI 없이 동작 확인)
// 사용법: node dist/smoke.js <claude|codex|gemini> "<질문>" [sessionId]
import { adapters } from './adapters/index.js';
import type { AdapterName } from './adapters/types.js';

const [, , name, question, sessionId] = process.argv;

if (!name || !question || !(name in adapters)) {
  console.error('사용법: node dist/smoke.js <claude|codex|gemini> "<질문>" [sessionId]');
  process.exit(1);
}

const adapter = adapters[name as AdapterName];
const start = Date.now();
let deltaCount = 0;

for await (const ev of adapter.ask(question, sessionId)) {
  const elapsed = ((Date.now() - start) / 1000).toFixed(1);
  if (ev.type === 'delta') {
    deltaCount += 1;
    process.stdout.write(ev.text ?? '');
  } else if (ev.type === 'done') {
    console.log(`\n--- done | deltas=${deltaCount} | sessionId=${ev.sessionId} | ${elapsed}s`);
  } else {
    console.error(`\n--- error | ${ev.error} | ${elapsed}s`);
    process.exit(2);
  }
}
