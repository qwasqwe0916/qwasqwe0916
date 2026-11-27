import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { api } from '../lib/api';
import RoomForm from '../components/RoomForm';

// 내 방: 참여 중인 방 목록, 방 만들기, 참여 코드로 들어가기
export default function RoomsPage() {
  const navigate = useNavigate();
  const [rooms, setRooms] = useState(null);
  const [error, setError] = useState('');
  const [mode, setMode] = useState(null); // 'create' | 'join' | null
  const [code, setCode] = useState('');
  const [joinError, setJoinError] = useState('');

  useEffect(() => {
    api.get('/api/rooms').then(setRooms).catch((err) => setError(err.message));
  }, []);

  async function create(values) {
    const { roomId } = await api.post('/api/rooms', values);
    navigate(`/rooms/${roomId}`);
  }

  async function join(e) {
    e.preventDefault();
    setJoinError('');
    if (
      !window.confirm(
        '방에 참여하면 방 관리자에게 이름, 학과, 이메일이 공개됩니다.\n(팀 편성 현황 확인과 연락을 위해 사용됩니다)\n\n참여하시겠습니까?'
      )
    )
      return;
    try {
      const { roomId } = await api.post('/api/rooms/join', { code });
      navigate(`/rooms/${roomId}`);
    } catch (err) {
      setJoinError(err.message);
    }
  }

  return (
    <div className="card">
      <div className="title-row">
        <h1>내 방</h1>
        <div className="actions">
          <button type="button" className={mode === 'join' ? '' : 'secondary'} onClick={() => setMode(mode === 'join' ? null : 'join')}>
            코드로 참여
          </button>
          <button type="button" className={mode === 'create' ? '' : 'secondary'} onClick={() => setMode(mode === 'create' ? null : 'create')}>
            방 만들기
          </button>
        </div>
      </div>
      <p className="muted small">
        수업 팀플처럼 정해진 사람끼리 조를 짤 때 쓰는 공간입니다. 방을 만든 사람이 관리자가 되고, 참여 코드로만 들어올 수 있습니다.
        자유로운 모집은 <Link to="/">전체 게시판</Link>을 이용하세요.
      </p>

      {mode === 'join' && (
        <section className="panel">
          <h2>참여 코드로 들어가기</h2>
          <form onSubmit={join} className="join-form">
            <input
              value={code}
              onChange={(e) => setCode(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ''))}
              maxLength={6}
              placeholder="6자리 코드"
              className="code-input"
            />
            <button type="submit" disabled={code.length !== 6}>
              참여하기
            </button>
          </form>
          {joinError && <p className="error">{joinError}</p>}
        </section>
      )}

      {mode === 'create' && (
        <section className="panel">
          <h2>방 만들기</h2>
          <RoomForm submitLabel="방 만들기" onSubmit={create} onCancel={() => setMode(null)} />
        </section>
      )}

      {error ? (
        <p className="error">{error}</p>
      ) : rooms === null ? (
        <p className="muted">불러오는 중…</p>
      ) : rooms.length === 0 ? (
        <p className="muted">참여 중인 방이 없습니다. 방을 만들거나 참여 코드를 입력해 보세요.</p>
      ) : (
        <ul className="post-list">
          {rooms.map((room) => (
            <li key={room.roomId}>
              <Link to={`/rooms/${room.roomId}`} className="post-item">
                <div className="badges">
                  {room.role === 'MANAGER' && <span className="badge app-ACCEPTED">관리자</span>}
                  {room.isDeadlinePassed && <span className="badge expired">마감일 지남</span>}
                </div>
                <strong className="post-title">{room.name}</strong>
                <span className="muted small">
                  참여 {room.memberCount}명 · 모집글 {room.postCount}개
                  {(room.minTeamSize || room.maxTeamSize) &&
                    ` · 팀 ${room.minTeamSize ?? '?'}~${room.maxTeamSize ?? '?'}명`}
                  {room.teamDeadline && ` · 마감 ${room.teamDeadline}`}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
