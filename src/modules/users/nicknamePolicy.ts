/**
 * 운영하며 보강할 최소 금칙어 목록. 부분 문자열로 검사한다.
 */
const forbiddenWords = ['admin', 'administrator', 'cutin', 'official', '운영자', '관리자', '컷인']

export function containsForbiddenWord(nickname: string): boolean {
  const normalized = nickname.toLowerCase()
  return forbiddenWords.some((word) => normalized.includes(word))
}
