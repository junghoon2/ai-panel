// 패널 표시용 텍스트 유틸 — 표시 폭 기준으로 줄바꿈한 뒤 마지막 N줄(tail)만 남긴다
// (Ink Box 는 스크롤이 없으므로 긴 답변은 최신 내용 우선으로 잘라서 보여준다)

/** 문자 1개의 터미널 표시 폭 (한글/CJK/전각 = 2칸 근사) */
function charWidth(ch: string): number {
  const cp = ch.codePointAt(0) ?? 0;
  if (
    (cp >= 0x1100 && cp <= 0x115f) || // 한글 자모
    (cp >= 0x2e80 && cp <= 0xa4cf) || // CJK 부수·한자·가나
    (cp >= 0xac00 && cp <= 0xd7a3) || // 한글 음절
    (cp >= 0xf900 && cp <= 0xfaff) || // CJK 호환 한자
    (cp >= 0xfe30 && cp <= 0xfe4f) || // CJK 호환 형태
    (cp >= 0xff00 && cp <= 0xff60) || // 전각 영숫자·기호
    (cp >= 0xffe0 && cp <= 0xffe6) // 전각 통화 기호
  ) {
    return 2;
  }
  return 1;
}

/** 한 줄을 표시 폭 기준으로 잘라 여러 줄로 나눈다 */
function wrapLine(line: string, width: number): string[] {
  const out: string[] = [];
  let current = '';
  let currentWidth = 0;
  for (const ch of line) {
    const w = charWidth(ch);
    if (currentWidth + w > width && current) {
      out.push(current);
      current = '';
      currentWidth = 0;
    }
    current += ch;
    currentWidth += w;
  }
  out.push(current);
  return out;
}

/** 표시 폭 기준으로 줄바꿈한 전체 줄 배열 (스크롤 계산용) */
export function wrapToWidth(text: string, width: number): string[] {
  if (width < 1) return [];
  return text.split('\n').flatMap((line) => wrapLine(line, width));
}

export function tailLines(text: string, width: number, maxLines: number): string {
  if (width < 1 || maxLines < 1) return '';
  return wrapToWidth(text, width).slice(-maxLines).join('\n');
}
