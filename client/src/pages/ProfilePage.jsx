import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../lib/api';
import { validateProfileInput } from '../lib/profile';
import { formatDate } from '../lib/format';
import { useAuth } from '../auth/AuthContext';
import { useOptions } from '../lib/useOptions';
import SkillPicker from '../components/SkillPicker';
import SkillTags from '../components/SkillTags';

// 내 프로필: 보기 상태 → [수정하기] → 수정 상태 → [저장하기] / [취소]
export default function ProfilePage() {
  const { profile, setProfile, signOut } = useAuth();
  const navigate = useNavigate();

  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState({ name: '', department: '', githubUrl: '', skillIds: [] });
  const skills = useOptions('/api/skills');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  function startEdit() {
    setForm({
      name: profile.name,
      department: profile.department ?? '',
      githubUrl: profile.githubUrl ?? '',
      skillIds: profile.skills.map((skill) => skill.skillId),
    });
    setError('');
    setEditing(true);
  }

  function cancelEdit() {
    setError('');
    setEditing(false);
  }

  async function save(e) {
    e.preventDefault();
    const message = validateProfileInput(form);
    setError(message);
    if (message) return;

    setBusy(true);
    try {
      setProfile(await api.put('/api/me', form));
      setEditing(false);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  async function withdraw() {
    const confirmed = window.confirm(
      '정말 탈퇴하시겠습니까?\n\n작성한 글, 댓글, 지원 내역과 프로필 정보가 모두 삭제되며 되돌릴 수 없습니다.'
    );
    if (!confirmed) return;

    setBusy(true);
    try {
      await api.delete('/api/me');
      window.alert('탈퇴가 완료되었습니다.');
      await signOut({ scope: 'local' });
      navigate('/', { replace: true });
    } catch (err) {
      setError(err.message);
      setBusy(false);
    }
  }

  const update = (field) => (e) => setForm({ ...form, [field]: e.target.value });

  return (
    <div className="card narrow">
      <h1>내 프로필</h1>

      {editing ? (
        <form onSubmit={save} className="form">
          <label>
            이메일
            <input value={profile.email} disabled />
          </label>
          <label>
            <span>
              이름 <span className="required">*</span>
            </span>
            <input value={form.name} onChange={update('name')} maxLength={50} required />
          </label>
          <label>
            학과
            <input value={form.department} onChange={update('department')} maxLength={50} placeholder="예: 컴퓨터공학과" />
          </label>
          <label>
            GitHub 주소
            <input
              value={form.githubUrl}
              onChange={update('githubUrl')}
              maxLength={255}
              placeholder="https://github.com/아이디"
            />
          </label>
          <div className="field">
            보유 기술 스택
            <SkillPicker
              skills={skills}
              selectedIds={form.skillIds}
              onChange={(skillIds) => setForm({ ...form, skillIds })}
            />
          </div>
          <div className="actions">
            <button type="submit" disabled={busy}>
              {busy ? '저장 중…' : '저장하기'}
            </button>
            <button type="button" className="secondary" onClick={cancelEdit} disabled={busy}>
              취소
            </button>
          </div>
        </form>
      ) : (
        <>
          <dl className="info">
            <dt>이메일</dt>
            <dd>{profile.email}</dd>
            <dt>이름</dt>
            <dd>{profile.name}</dd>
            <dt>학과</dt>
            <dd>{profile.department || <span className="muted">미입력</span>}</dd>
            <dt>GitHub</dt>
            <dd>
              {profile.githubUrl ? (
                <a href={profile.githubUrl} target="_blank" rel="noreferrer">
                  {profile.githubUrl.replace('https://', '')}
                </a>
              ) : (
                <span className="muted">미입력</span>
              )}
            </dd>
            <dt>기술 스택</dt>
            <dd>
              <SkillTags skills={profile.skills} emptyText="미입력" />
            </dd>
            <dt>가입일</dt>
            <dd>{formatDate(profile.createdAt)}</dd>
          </dl>
          <div className="form">
            <button type="button" onClick={startEdit} disabled={busy}>
              수정하기
            </button>
            <button type="button" className="danger" onClick={withdraw} disabled={busy}>
              {busy ? '처리 중…' : '탈퇴하기'}
            </button>
          </div>
        </>
      )}

      {error && <p className="error">{error}</p>}
    </div>
  );
}
