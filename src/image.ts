// 질문 텍스트에서 이미지 파일 경로를 자동 감지해 분리한다
// (스크린샷을 터미널에 드래그&드롭하면 경로가 입력되는 흐름을 지원)
import { existsSync } from 'node:fs';
import { homedir } from 'node:os';

// 따옴표로 감싼 경로 | 드래그&드롭의 "\ " 이스케이프 포함 경로
const IMAGE_PATH_RE =
  /"[^"]+\.(?:png|jpe?g|gif|webp)"|'[^']+\.(?:png|jpe?g|gif|webp)'|(?:[^\s\\"']|\\ )+\.(?:png|jpe?g|gif|webp)/gi;

/** 매치된 원문을 실제 파일 경로로 정규화 (따옴표 제거, "\ " 복원, ~ 확장) */
function normalizePath(raw: string): string {
  let p = raw;
  if ((p.startsWith('"') && p.endsWith('"')) || (p.startsWith("'") && p.endsWith("'"))) {
    p = p.slice(1, -1);
  }
  p = p.replace(/\\ /g, ' ');
  if (p.startsWith('~/')) p = homedir() + p.slice(1);
  return p;
}

export interface ImageExtraction {
  /** 이미지 경로를 제거한 나머지 질문 텍스트 */
  question: string;
  /** 실제로 존재하는 이미지 파일의 절대/상대 경로 */
  images: string[];
}

export function extractImagePaths(input: string): ImageExtraction {
  const images: string[] = [];
  let question = input;

  for (const match of input.match(IMAGE_PATH_RE) ?? []) {
    const path = normalizePath(match);
    // 실재하는 파일만 이미지로 취급 — 아니면 일반 텍스트로 남긴다
    if (existsSync(path)) {
      images.push(path);
      question = question.replace(match, ' ');
    }
  }

  return { question: question.replace(/\s{2,}/g, ' ').trim(), images };
}

/** 확장자 기반 MIME 타입 (claude base64 블록용) */
export function imageMimeType(path: string): string {
  const ext = path.toLowerCase().split('.').pop();
  if (ext === 'jpg' || ext === 'jpeg') return 'image/jpeg';
  if (ext === 'gif') return 'image/gif';
  if (ext === 'webp') return 'image/webp';
  return 'image/png';
}
