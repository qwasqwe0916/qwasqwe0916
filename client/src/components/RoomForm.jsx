import { useState } from 'react';

// 방 만들기 / 방 설정 수정 공용 입력 폼
export default function RoomForm({ initial, submitLabel, onSubmit, onCancel }) {
  const [form, setForm] = useState({
    name: initial?.name ?? '',
    description: initial?.description ?? '',
    minTeamSize: initial?.minTeamSize ?? '',
    maxTeamSize: initial?.maxTeamSize ?? '',
    teamDeadline: initial?.teamDeadline ?? '',
  });
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const update = (field) => (e) => setForm({ ...form, [field]: e.target.value });

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    if (!form.name.trim()) return setError('방 이름을 입력해 주세요.');
    const min = form.minTeamSize === '' ? null : Number(form.minTeamSize);
    const max = form.maxTeamSize === '' ? null : Number(form.maxTeamSize);
    if (min && max && max < min) return setError('최대 인원은 최소 인원보다 작을 수 없습니다.');
    setBusy(true);
    try {
      await onSubmit({ ...form, minTeamSize: min, maxTeamSize: max, teamDeadline: form.teamDeadline || null });
    } catch (err) {
      setError(err.message);
      setBusy(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="form">
      <label>
        <span>
          방 이름 <span className="required">*</span>
        </span>
        <input value={form.name} onChange={update('name')} maxLength={100} placeholder="예: 데이터베이스 2분반 텀프로젝트" />
      </label>
      <label>
        설명
        <textarea value={form.description} onChange={update('description')} maxLength={1000} rows={3} placeholder="조 편성 안내 등" />
      </label>
      <div className="field-row">
        <label>
          팀 최소 인원
          <input type="number" min={2} max={20} value={form.minTeamSize} onChange={update('minTeamSize')} placeholder="제한 없음" />
        </label>
        <label>
          팀 최대 인원
          <input type="number" min={2} max={20} value={form.maxTeamSize} onChange={update('maxTeamSize')} placeholder="제한 없음" />
        </label>
      </div>
      <p className="muted small hint">팀 인원은 모집글 작성자를 포함한 인원입니다. 비워 두면 제한이 없습니다.</p>
      <label>
        팀 구성 마감일
        <input type="date" value={form.teamDeadline} onChange={update('teamDeadline')} />
        <span className="muted small hint-text">마감일이 지나면 새 모집글과 지원은 막히고, 이미 수락이 끝난 글의 팀 구성만 할 수 있습니다.</span>
      </label>
      <p className="muted small hint">방을 만든 사람은 관리자가 되며, 팀 편성에는 참여하지 않습니다. (방 글에 댓글은 쓸 수 있습니다)</p>
      <div className="actions">
        <button type="submit" disabled={busy}>
          {busy ? '저장 중…' : submitLabel}
        </button>
        {onCancel && (
          <button type="button" className="secondary" onClick={onCancel} disabled={busy}>
            취소
          </button>
        )}
      </div>
      {error && <p className="error">{error}</p>}
    </form>
  );
}
