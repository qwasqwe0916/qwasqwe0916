import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../lib/api';
import { useAuth } from '../auth/AuthContext';

// mode="create": 첫 로그인 시 프로필 등록, mode="edit": 내 프로필 수정
export default function ProfileFormPage({ mode }) {
  const { session, profile, setProfile, signOut } = useAuth();
  const navigate = useNavigate();
  const isCreate = mode === 'create';

  const [name, setName] = useState(profile?.name ?? '');
  const [department, setDepartment] = useState(profile?.department ?? '');
  const [githubUrl, setGithubUrl] = useState(profile?.githubUrl ?? '');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    if (!name.trim()) return setError('이름을 입력해 주세요.');
    if (githubUrl.trim() && !githubUrl.trim().startsWith('https://github.com/')) {
      return setError('GitHub 주소는 https://github.com/ 으로 시작해야 합니다.');
    }

    setBusy(true);
    try {
      const body = { name, department, githubUrl };
      const saved = isCreate ? await api.post('/api/me', body) : await api.put('/api/me', body);
      setProfile(saved);
      navigate('/');
    } catch (err) {
      setError(err.message);
      setBusy(false);
    }
  }

  return (
    <div className="card narrow">
      <h1>{isCreate ? '프로필 등록' : '프로필 수정'}</h1>
      {isCreate && <p className="muted">처음 오셨네요! 팀원들에게 보여줄 프로필을 입력해 주세요.</p>}

      <form onSubmit={handleSubmit} className="form">
        <label>
          이메일
          <input value={profile?.email ?? session?.user?.email ?? ''} disabled />
        </label>
        <label>
          <span>
            이름 <span className="required">*</span>
          </span>
          <input value={name} onChange={(e) => setName(e.target.value)} maxLength={50} placeholder="실명" required />
        </label>
        <label>
          학과
          <input
            value={department}
            onChange={(e) => setDepartment(e.target.value)}
            maxLength={50}
            placeholder="예: 컴퓨터공학과"
          />
        </label>
        <label>
          GitHub 주소
          <input
            value={githubUrl}
            onChange={(e) => setGithubUrl(e.target.value)}
            maxLength={255}
            placeholder="https://github.com/아이디"
          />
        </label>
        <button type="submit" disabled={busy}>
          {busy ? '저장 중…' : isCreate ? '등록하기' : '저장하기'}
        </button>
        {!isCreate && (
          <button type="button" className="secondary" onClick={() => navigate('/')}>
            취소
          </button>
        )}
      </form>

      {error && (
        <p className="error">
          {error}
          {isCreate && (
            <>
              {' '}
              <button type="button" className="link" onClick={signOut}>
                다른 계정으로 로그인
              </button>
            </>
          )}
        </p>
      )}
    </div>
  );
}
