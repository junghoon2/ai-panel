// gemini 슬롯 어댑터 — Antigravity CLI(`agy`) 백엔드
//
// 배경: Google 이 2026-06-18 부로 개인(무료/Pro/Ultra) 계정의 기존 Gemini CLISERVING 을
//       중단하고 Antigravity CLI(agy) 로 이관했다. 그래서 이 슬롯은 agy 를 호출한다.
//
// 제약 (agy print 모드, 실측 아님 — 공식 이슈/문서 기준):
//   - stream-json/구조화 출력 미지원: `agy -p` 는 완성된 plain text 만 돌려준다.
//     → 실시간 델타 스트리밍 불가. 응답을 모아 done 직전에 한 번에 yield 한다.
//   - 세션 id 미노출: print 모드가 conversation id 를 stdout/stderr 어디에도 내보내지
//     않는다(google-antigravity/antigravity-cli#7). 특정 세션 resume 불가.
//     → `--continue` 로 워크스페이스(cwd)의 최근 대화만 이어간다. cwd 가 고정이라
//       사실상 한 줄기 세션이 유지된다.
//   - non-TTY stdout 에서 최종 응답이 누락되는 알려진 버그가 있다. 빈 출력이면
//     사용자에게 그 사실을 알리는 에러로 변환한다.
import type { Adapter, AdapterEvent } from './types.js';
import { errorMessage } from './types.js';
import { killActiveSpawns, spawnText } from './proc.js';

// resume 여부만 패널에 알리면 되는 마커 — agy 는 실제 세션 id 를 주지 않으므로
// 값 자체는 의미 없고 "이어갈 세션이 있다"는 신호로만 쓰인다.
const SESSION_MARKER = 'agy';

// agy print 모드는 기본 5분(--print-timeout) 까지 돌 수 있어, 안전망을 그에 맞춰 늘린다.
const AGY_TIMEOUT_MS = 300_000;

export const geminiAdapter: Adapter = {
  name: 'gemini',
  cancelActive: killActiveSpawns, // 턴 중단 — 실행 중인 spawn 종료

  async *ask(question: string, sessionId?: string, images?: string[]): AsyncGenerator<AdapterEvent> {
    // 새 세션 첫 턴에만 언어 지시를 붙인다 (이어가는 턴은 히스토리에 남아 불필요)
    let prompt = sessionId
      ? question
      : `(지시: 반드시 사용자의 질문과 동일한 언어로 답변할 것)\n\n${question}`;

    // 이미지는 @경로 문법으로 첨부 (공백은 "\ " 이스케이프)
    if (images && images.length > 0) {
      const refs = images.map((p) => `@${p.replace(/ /g, '\\ ')}`).join(' ');
      prompt = `${refs} ${prompt}`;
    }

    const args = ['-p', prompt];

    // 워크스페이스(cwd) 밖 이미지는 차단되므로 이미지 디렉토리를 워크스페이스에 추가한다
    if (images && images.length > 0) {
      const dirs = [...new Set(images.map((p) => p.slice(0, p.lastIndexOf('/')) || '.'))];
      for (const dir of dirs) args.push('--add-dir', dir);
    }
    // 세션 id 지정이 불가능하므로 워크스페이스(cwd)의 최근 대화를 이어간다
    if (sessionId) args.push('--continue');

    try {
      const text = (await spawnText('agy', args, AGY_TIMEOUT_MS)).trim();

      if (!text) {
        // non-TTY stdout 에서 응답이 누락되는 agy 의 알려진 버그
        yield { type: 'error', error: 'agy 가 빈 응답을 반환했습니다 (non-TTY stdout 출력 누락 가능)' };
        return;
      }

      yield { type: 'delta', text };
      yield { type: 'done', sessionId: SESSION_MARKER };
    } catch (err) {
      yield { type: 'error', error: errorMessage(err) };
    }
  },
};
