import { useState } from 'react';
import { supabase } from '../lib/supabase';

const ALLOWED_EMAIL_DOMAIN = '@seoultech.ac.kr';

// 학교 이메일 입력 → 인증번호 입력 → 로그인
export default function LoginPage() {
  const [step, setStep] = useState('email');
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function sendCode(e) {
    e?.preventDefault();
    const trimmed = email.trim().toLowerCase();
    setError('');
    setMessage('');
    if (!trimmed.endsWith(ALLOWED_EMAIL_DOMAIN)) {
      setError(`교내 이메일(${ALLOWED_EMAIL_DOMAIN})만 사용할 수 있습니다.`);
      return;
    }

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
            <input
              type="email"
              placeholder={`학번 또는 아이디${ALLOWED_EMAIL_DOMAIN}`}
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              autoFocus
              required
            />
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
    </div>
  );
}
