// 서버 기준 오늘 날짜 'YYYY-MM-DD' (마감일 비교용)
export function today() {
  return new Date().toLocaleDateString('sv-SE');
}
