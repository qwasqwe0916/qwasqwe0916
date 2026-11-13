export const STATUS_LABELS = { OPEN: '모집중', CLOSED: '모집완료' };

export function formatDate(value) {
  return new Date(value).toLocaleDateString('ko-KR');
}

// 'YYYY-MM-DD' → '2026. 11. 30.' (시간대 변환 없이)
export function formatDeadline(deadline) {
  if (!deadline) return '상시 모집';
  const [y, m, d] = deadline.split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString('ko-KR');
}

export const APPLICATION_STATUS_LABELS = { PENDING: '대기', ACCEPTED: '수락', REJECTED: '거절' };
