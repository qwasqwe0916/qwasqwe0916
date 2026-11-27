import { useState } from 'react';
import { supabase } from '../lib/supabase';

const ALLOWED_EMAIL_DOMAIN = '@seoultech.ac.kr';
// 메일 주소의 @ 앞부분에 쓸 수 있는 문자
const LOCAL_PART_PATTERN = /^[a-z0-9._%+-]+$/;

// 학교 이메일 입력 → 인증번호 입력 → 로그인
export default function LoginPage() {
  const [step, setStep] = useState('email');
  const [localPart, setLocalPart] = useState(''); // 사용자가 입력하는 @ 앞부분
  const [email, setEmail] = useState(''); // 인증번호를 보낸 전체 주소
  const [code, setCode] = useState('');
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function sendCode(e) {
    e?.preventDefault();
    setError('');
    setMessage('');
    // 사용자는 @ 앞부분만 입력하고, 도메인은 @seoultech.ac.kr로 고정한다
    let id = localPart.trim().toLowerCase();
    if (id.endsWith(ALLOWED_EMAIL_DOMAIN)) id = id.slice(0, -ALLOWED_EMAIL_DOMAIN.length);
    if (!id) {
      setError('학교 메일 아이디를 입력해 주세요.');
      return;
    }
    if (id.includes('@')) {
      setError(`@ 뒤는 입력하지 않아도 됩니다. 아이디만 입력하면 자동으로 ${ALLOWED_EMAIL_DOMAIN}이 붙습니다.`);
      return;
    }
    if (!LOCAL_PART_PATTERN.test(id)) {
      setError('아이디에는 영문, 숫자와 . _ - + 만 쓸 수 있습니다.');
      return;
    }
    const trimmed = id + ALLOWED_EMAIL_DOMAIN;

    setBusy(true);
    const { error } = await supabase.auth.signInWithOtp({
      email: trimmed,
      options: { shouldCreateUser: true },
    });
    setBusy(false);

    if (error) {
      setError(`인증번호를 보내지 못했습니다. 잠시 후 다시 시도해 주세요. (${error.message})`);
      return;
    }
    setEmail(trimmed);
    setStep('code');
    setMessage(`${trimmed}로 인증번호를 보냈습니다. 메일함(스팸함 포함)을 확인해 주세요.`);
  }

  // 개발 모드 전용: Supabase에서 비밀번호로 만든 테스트 계정 로그인
  async function testLogin(e) {
    e.preventDefault();
    const data = new FormData(e.currentTarget);
    setError('');
    setBusy(true);
    const { error } = await supabase.auth.signInWithPassword({
      email: String(data.get('email')).trim().toLowerCase(),
      password: String(data.get('password')),
    });
    setBusy(false);
    if (error) setError(`테스트 계정 로그인에 실패했습니다. (${error.message})`);
  }

  async function verifyCode(e) {
    e.preventDefault();
    setError('');
    setBusy(true);
    const { error } = await supabase.auth.verifyOtp({ email, token: code.trim(), type: 'email' });
    setBusy(false);
    // 성공하면 로그인 상태가 바뀌면서 자동으로 다음 화면으로 이동한다
    if (error) setError('인증번호가 올바르지 않거나 만료되었습니다.');
  }

  return (
    <div className="card narrow">
      <h1>로그인</h1>
      <p className="muted">서울과학기술대학교 이메일로 로그인합니다. 처음이라면 자동으로 가입됩니다.</p>

      {step === 'email' ? (
        <form onSubmit={sendCode} className="form">
          <label>
            학교 이메일
            <div className="email-input">
              <input
                type="text"
                inputMode="email"
                autoComplete="username"
                autoCapitalize="none"
                spellCheck={false}
                placeholder="학번 또는 아이디"
                value={localPart}
                // 전체 주소를 붙여넣어도 도메인 부분은 자동으로 떼어 낸다
                onChange={(e) => setLocalPart(e.target.value.replace(/@seoultech\.ac\.kr$/i, ''))}
                autoFocus
                required
              />
              <span className="email-domain">{ALLOWED_EMAIL_DOMAIN}</span>
            </div>
          </label>
          <button type="submit" disabled={busy}>
            {busy ? '보내는 중…' : '인증번호 받기'}
          </button>
        </form>
      ) : (
        <form onSubmit={verifyCode} className="form">
          <label>
            인증번호
            <input
              inputMode="numeric"
              autoComplete="one-time-code"
              placeholder="메일로 받은 숫자"
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))}
              maxLength={10}
              autoFocus
              required
            />
          </label>
          <button type="submit" disabled={busy || code.length < 6}>
            {busy ? '확인 중…' : '로그인'}
          </button>
          <div className="row">
            <button type="button" className="link" onClick={sendCode} disabled={busy}>
              인증번호 다시 받기
            </button>
            <button
              type="button"
              className="link"
              onClick={() => {
                setStep('email');
                setCode('');
                setMessage('');
                setError('');
              }}
            >
              이메일 다시 입력
            </button>
          </div>
        </form>
      )}

      {message && <p className="notice">{message}</p>}
      {error && <p className="error">{error}</p>}

      {import.meta.env.DEV && (
        <details className="dev-login">
          <summary>개발용: 테스트 계정으로 로그인</summary>
          <form onSubmit={testLogin} className="form">
            <input name="email" type="email" placeholder="테스트 계정 이메일" required />
            <input name="password" type="password" placeholder="비밀번호" required />
            <button type="submit" className="secondary" disabled={busy}>
              테스트 계정 로그인
            </button>
          </form>
        </details>
      )}
    </div>
  );
}
