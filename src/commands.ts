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
