import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../lib/api';

// 관리자 전용 팀 편성 현황판 (R34)
export default function RoomStatus({ room }) {
  const [status, setStatus] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    api.get(`/api/rooms/${room.roomId}/status`).then(setStatus).catch((err) => setError(err.message));
  }, [room.roomId]);

  async function exportCsv() {
    try {
      await api.download(`/api/rooms/${room.roomId}/export`, `${room.name}-조편성.csv`);
    } catch (err) {
      setError(err.message);
    }
  }

  if (error) return <p className="error">{error}</p>;
  if (!status) return <p className="muted">불러오는 중…</p>;

  const assigned = status.totalParticipants - status.unassigned.length;
  return (
    <div>
      <div className="title-row">
        <p className="muted small">
          편성 대상 {status.totalParticipants}명 중 <strong>{assigned}명</strong> 팀 구성 완료 · 팀 {status.teams.length}개 · 미편성{' '}
          <strong>{status.unassigned.length}명</strong>
        </p>
        <button type="button" className="secondary" onClick={exportCsv}>
          CSV 내려받기
        </button>
      </div>

      <section className="panel">
        <h2>구성된 팀</h2>
        {status.teams.length === 0 ? (
          <p className="muted small">아직 구성된 팀이 없습니다.</p>
        ) : (
          <ol className="team-status-list">
            {status.teams.map((team) => (
              <li key={team.postId}>
                <div className="applicant-head">
                  <Link to={`/posts/${team.postId}`}>
                    <strong>{team.title}</strong>
                  </Link>
                  <span className="muted small">{team.size}명</span>
                  {team.isShort && <span className="badge app-REJECTED">인원 부족 (최소 {status.minTeamSize}명)</span>}
                </div>
                <ul className="member-mini">
                  {team.members.map((m) => (
                    <li key={m.userId}>
                      {m.name}
                      {m.role === 'LEADER' && <span className="muted small"> (작성자)</span>}
                      {m.department && <span className="muted small"> · {m.department}</span>}
                      <a href={`mailto:${m.email}`} className="small">
                        {' '}
                        {m.email}
                      </a>
                    </li>
                  ))}
                </ul>
              </li>
            ))}
          </ol>
        )}
      </section>

      <section className="panel">
        <h2>미편성 참여자</h2>
        {status.unassigned.length === 0 ? (
          <p className="muted small">모든 참여자가 팀에 소속되었습니다.</p>
        ) : (
          <ul className="member-mini">
            {status.unassigned.map((u) => (
              <li key={u.userId}>
                {u.name}
                {u.department && <span className="muted small"> · {u.department}</span>}
                <a href={`mailto:${u.email}`} className="small">
                  {' '}
                  {u.email}
                </a>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
