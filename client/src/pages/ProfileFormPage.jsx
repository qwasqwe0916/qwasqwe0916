import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../lib/api';
import { validateProfileInput } from '../lib/profile';
import { useAuth } from '../auth/AuthContext';
import { useOptions } from '../lib/useOptions';
import SkillPicker from '../components/SkillPicker';

// 첫 로그인 시 프로필 등록
export default function ProfileFormPage() {
  const { session, setProfile, signOut } = useAuth();
  const navigate = useNavigate();

  const [name, setName] = useState('');
  const [department, setDepartment] = useState('');
  const [githubUrl, setGithubUrl] = useState('');
  const [skillIds, setSkillIds] = useState([]);
  const skills = useOptions('/api/skills');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    const message = validateProfileInput({ name, githubUrl });
    setError(message);
    if (message) return;

    setBusy(true);
    try {
      setProfile(await api.post('/api/me', { name, department, githubUrl, skillIds }));
      navigate('/');
    } catch (err) {
      setError(err.message);
      setBusy(false);
    }
  }

  return (
    <div className="card narrow">
      <h1>프로필 등록</h1>
      <p className="muted">처음 오셨네요! 팀원들에게 보여줄 프로필을 입력해 주세요.</p>

      <form onSubmit={handleSubmit} className="form">
        <label>
          이메일
          <input value={session?.user?.email ?? ''} disabled />
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
        <div className="field">
          보유 기술 스택
          <SkillPicker skills={skills} selectedIds={skillIds} onChange={setSkillIds} />
        </div>
        <button type="submit" disabled={busy}>
          {busy ? '저장 중…' : '등록하기'}
        </button>
      </form>

      {error && (
        <p className="error">
          {error}{' '}
          <button type="button" className="link" onClick={() => signOut()}>
            다른 계정으로 로그인
          </button>
        </p>
      )}
    </div>
  );
}
