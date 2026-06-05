// macOS 클립보드의 이미지를 임시 PNG 파일로 꺼낸다 (파일 저장 없이 캡처한 스크린샷 첨부용)
// 외부 의존성 없이 내장 osascript 를 사용한다.
import { execFileSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

/**
 * 클립보드에 이미지가 있으면 임시 PNG 파일로 저장하고 경로를 돌려준다.
 * 이미지가 없으면(텍스트만 복사된 상태 등) null.
 */
export function clipboardImageToFile(): string | null {
  const path = join(tmpdir(), `ai-panel-clip-${Date.now()}.png`);
  // «class PNGf» 변환은 클립보드에 이미지가 없으면 에러를 던진다
  const script = [
    'set imgData to the clipboard as «class PNGf»',
    `set f to open for access POSIX file "${path}" with write permission`,
    'set eof of f to 0',
    'write imgData to f',
    'close access f',
  ].join('\n');

  try {
    execFileSync('osascript', ['-e', script], { stdio: 'ignore' });
    return path;
  } catch {
    return null;
  }
}
