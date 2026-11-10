// 프로필 입력값 검사 (서버와 같은 규칙). 문제가 있으면 오류 메시지를 돌려준다.
export function validateProfileInput({ name, githubUrl }) {
  if (!name.trim()) return '이름을 입력해 주세요.';
  if (githubUrl.trim() && !githubUrl.trim().startsWith('https://github.com/')) {
    return 'GitHub 주소는 https://github.com/ 으로 시작해야 합니다.';
  }
  return '';
}
