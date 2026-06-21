// 자식 프로세스 공통 헬퍼 — CLI 를 spawn 하고 stdout 을 줄 단위 JSON 으로 yield 한다
import { spawn } from 'node:child_process';
import { createInterface } from 'node:readline';

/** 도구별 안전망 타임아웃 (응답 없이 영원히 대기하는 상황 방지) */
export const DEFAULT_TIMEOUT_MS = 120_000;

// 현재 실행 중인 자식 프로세스 — 사용자가 ESC 로 턴을 중단할 때 일괄 종료한다
// (한 번에 한 턴만 실행되므로(busy 잠금) 전체 kill 이 곧 현재 턴 취소다)
const activeChildren = new Set<import('node:child_process').ChildProcess>();

/** 진행 중인 spawn 자식 프로세스를 모두 종료한다 (턴 중단용) */
export function killActiveSpawns(): void {
  for (const child of activeChildren) child.kill('SIGKILL');
}

/**
 * command 를 실행해 stdout 의 JSONL 을 파싱해 yield 한다.
 * - JSON 이 아닌 줄은 무시한다 (배너/로그 등)
 * - stdin 은 닫는다 (codex 가 파이프 입력을 기다리는 것 방지)
 * - 비정상 종료/타임아웃/실행 실패 시 stderr 꼬리를 담아 throw 한다
 */
export async function* spawnJsonl(
  command: string,
  args: string[],
  timeoutMs = DEFAULT_TIMEOUT_MS,
): AsyncGenerator<Record<string, unknown>> {
  const child = spawn(command, args, { stdio: ['ignore', 'pipe', 'pipe'] });
  activeChildren.add(child);
  child.once('close', () => activeChildren.delete(child));

  // stderr 는 화면에 흘리지 않고 실패 시 진단용으로 꼬리만 보관
  let stderrTail = '';
  child.stderr.on('data', (chunk: Buffer) => {
    stderrTail = (stderrTail + chunk.toString()).slice(-2000);
  });

  // spawn 자체 실패 (명령 없음 등) — 'error' 리스너가 없으면 프로세스가 죽으므로 반드시 잡는다
  let spawnError: Error | undefined;
  const closed = new Promise<number | null>((resolve) => {
    child.once('close', (code) => resolve(code));
    child.once('error', (err) => {
      spawnError = err;
      resolve(null);
    });
  });

  let timedOut = false;
  const timer = setTimeout(() => {
    timedOut = true;
    child.kill('SIGKILL');
  }, timeoutMs);

  try {
    const rl = createInterface({ input: child.stdout });
    for await (const line of rl) {
      const trimmed = line.trim();
      if (!trimmed.startsWith('{')) continue; // JSON 아닌 줄(배너 등)은 무시
      try {
        yield JSON.parse(trimmed) as Record<string, unknown>;
      } catch {
        // 파싱 실패한 줄은 건너뛴다
      }
    }

    const code = await closed;
    if (spawnError) throw new Error(`${command} 실행 실패: ${spawnError.message}`);
    if (timedOut) throw new Error(`${Math.round(timeoutMs / 1000)}초 타임아웃으로 중단됨`);
    if (code !== 0) {
      const detail = stderrTail.trim().split('\n').slice(-3).join(' ').slice(-300);
      throw new Error(`종료 코드 ${code}${detail ? `: ${detail}` : ''}`);
    }
  } finally {
    clearTimeout(timer);
    // 소비자가 중간에 끊어도(early return) 자식 프로세스를 정리한다
    if (child.exitCode === null && !spawnError) child.kill('SIGKILL');
  }
}

/**
 * command 를 실행해 stdout 전체를 plain text 로 모아 한 번에 돌려준다.
 * agy(Antigravity CLI) 처럼 스트리밍/JSONL 을 지원하지 않고 print 모드에서
 * 완성된 텍스트만 내보내는 도구용. 종료/타임아웃/실행 실패 처리는 spawnJsonl 과 동일.
 */
export async function spawnText(
  command: string,
  args: string[],
  timeoutMs = DEFAULT_TIMEOUT_MS,
): Promise<string> {
  const child = spawn(command, args, { stdio: ['ignore', 'pipe', 'pipe'] });
  activeChildren.add(child);
  child.once('close', () => activeChildren.delete(child));

  let stdout = '';
  child.stdout.on('data', (chunk: Buffer) => {
    stdout += chunk.toString();
  });

  let stderrTail = '';
  child.stderr.on('data', (chunk: Buffer) => {
    stderrTail = (stderrTail + chunk.toString()).slice(-2000);
  });

  let spawnError: Error | undefined;
  const closed = new Promise<number | null>((resolve) => {
    child.once('close', (code) => resolve(code));
    child.once('error', (err) => {
      spawnError = err;
      resolve(null);
    });
  });

  let timedOut = false;
  const timer = setTimeout(() => {
    timedOut = true;
    child.kill('SIGKILL');
  }, timeoutMs);

  try {
    const code = await closed;
    if (spawnError) throw new Error(`${command} 실행 실패: ${spawnError.message}`);
    if (timedOut) throw new Error(`${Math.round(timeoutMs / 1000)}초 타임아웃으로 중단됨`);
    if (code !== 0) {
      const detail = stderrTail.trim().split('\n').slice(-3).join(' ').slice(-300);
      throw new Error(`종료 코드 ${code}${detail ? `: ${detail}` : ''}`);
    }
    return stdout;
  } finally {
    clearTimeout(timer);
    if (child.exitCode === null && !spawnError) child.kill('SIGKILL');
  }
}
