// 슬래시 명령 레지스트리 — 자동 완성과 "알 수 없는 명령" 안내의 단일 원천
// 새 명령을 추가하면 자동 완성 후보와 안내 메시지에 자동으로 반영된다
export interface SlashCommand {
  /** 명령 이름 — "/" 포함 */
  name: string;
  /** 자동 완성 목록에 함께 표시할 한 줄 설명 */
  description: string;
}

export const SLASH_COMMANDS: SlashCommand[] = [
  { name: '/claude', description: 'claude 에게만 질문 — /claude [질문] (질문 없으면 전용 모드 전환)' },
  { name: '/codex', description: 'codex 에게만 질문 — /codex [질문] (질문 없으면 전용 모드 전환)' },
  { name: '/gemini', description: 'gemini 에게만 질문 — /gemini [질문] (질문 없으면 전용 모드 전환)' },
  { name: '/all', description: '전용 모드 해제 — 다시 모든 도구에게 질문' },
  { name: '/paste', description: '클립보드 이미지 첨부 — /paste [질문]' },
  { name: '/review', description: '교차 리뷰 — /review <리뷰어> <대상> 또는 /review all' },
  { name: '/exit', description: '종료 (별칭: /quit, /q)' },
];

/**
 * 입력이 "/접두어" 형태(공백 없음)일 때 접두어가 일치하는 명령을 반환한다.
 * 공백이 들어간 뒤(인자 입력 중)에는 빈 배열 — 자동 완성을 닫는다.
 */
export function matchSlashCommands(input: string): SlashCommand[] {
  if (!/^\/\S*$/.test(input)) return [];
  return SLASH_COMMANDS.filter((c) => c.name.startsWith(input));
}

/**
 * `/claude` · `/codex` 뒤 인자가 "파일 쓰기 권한 토글" 요청인지 판별한다.
 * 켜기 요청이면 true, 끄기 요청이면 false, 일반 질문이면 null.
 * 예) "쓰기 권한 추가해줘" → true, "쓰기 권한 해제" → false, "버그 고쳐줘" → null
 */
export function parseWritePermissionIntent(text: string): boolean | null {
  const t = text.replace(/\s/g, '');
  if (!/(쓰기|편집)권한/.test(t)) return null; // "쓰기/편집 권한" 언급이 없으면 일반 질문
  if (/(해제|끄|꺼|제거|회수|취소|비활성|읽기전용|readonly|off)/.test(t)) return false;
  if (/(추가|허용|부여|켜|켬|활성|enable|on|줘|주세요|해줘)/.test(t)) return true;
  return null; // 권한을 언급했지만 토글 동사가 없으면 일반 질문으로 둔다
}
