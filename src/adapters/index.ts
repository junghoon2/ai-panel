// 어댑터 레지스트리
import type { Adapter, AdapterName } from './types.js';
import { claudeAdapter } from './claude.js';
import { codexAdapter } from './codex.js';
import { geminiAdapter } from './gemini.js';

export const adapters: Record<AdapterName, Adapter> = {
  claude: claudeAdapter,
  codex: codexAdapter,
  gemini: geminiAdapter,
};

export type { Adapter, AdapterName, AdapterEvent } from './types.js';
