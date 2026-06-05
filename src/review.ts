// 교차 리뷰 — /review 명령 파싱과 리뷰 프롬프트 빌더
import type { AdapterName } from './adapters/types.js';

export const REVIEW_USAGE = '사용법: /review <리뷰어> <대상> 또는 /review all';

export type ReviewCommand =
  | { kind: 'single'; reviewer: AdapterName; target: AdapterName }
  | { kind: 'all' }
  | { kind: 'error'; message: string };

/** "/review claude gemini" 형태의 명령을 구조로 파싱한다 (상태 검증은 호출부 책임) */
export function parseReviewCommand(line: string, validTools: AdapterName[]): ReviewCommand {
  const args = line.split(/\s+/).slice(1);

  if (args.length === 1 && args[0] === 'all') return { kind: 'all' };
  if (args.length !== 2) return { kind: 'error', message: REVIEW_USAGE };

  const [reviewer, target] = args as AdapterName[];
  for (const name of [reviewer, target]) {
    if (!validTools.includes(name)) {
      return { kind: 'error', message: `알 수 없는 도구: ${name} — ${REVIEW_USAGE}` };
    }
  }
  if (reviewer === target) {
    return { kind: 'error', message: '리뷰어와 대상이 같습니다. 서로 다른 도구를 지정하세요.' };
  }
  return { kind: 'single', reviewer, target };
}

/**
 * 리뷰 프롬프트를 만든다. 리뷰어의 기존 세션에 이어 보내므로
 * 리뷰어는 원래 질문과 자기 답변을 기억한 상태다.
 */
export function buildReviewPrompt(
  originalQuestion: string,
  targets: Array<{ name: AdapterName; answer: string }>,
): string {
  const who = targets.map((t) => t.name).join(', ');
  const sections = targets
    .map((t) => `--- ${t.name} 의 답변 ---\n${t.answer}\n---`)
    .join('\n\n');

  return [
    `다음은 같은 질문에 대해 다른 AI 도구(${who})가 내놓은 답변이다.`,
    '',
    `원래 질문: ${originalQuestion}`,
    '',
    sections,
    '',
    '위 답변을 리뷰해줘. 정확성(틀린 내용), 누락된 중요 정보, 너의 답변과의 차이점을 중심으로 간결하게.',
  ].join('\n');
}
