import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { api } from '../lib/api';
import PostListPage from './PostListPage';
import RoomForm from '../components/RoomForm';
import RoomStatus from '../components/RoomStatus';

// 방 화면: 방 정보 + 방 게시판, 관리자에게는 편성 현황·설정 탭
export default function RoomPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [result, setResult] = useState({ id: null, room: null, error: '' });
  const [version, setVersion] = useState(0);
  const [tab, setTab] = useState('board');
  const [message, setMessage] = useState('');
  const key = `${id}:${version}`;

  useEffect(() => {
    let cancelled = false;
    api
      .get(`/api/rooms/${id}`)
      .then((room) => !cancelled && setResult({ id: key, room, error: '' }))
      .catch((err) => !cancelled && setResult({ id: key, room: null, error: err.message }));
    return () => {
      cancelled = true;
    };
  }, [id, key]);

  if (result.id !== key && !result.room) return <p className="muted center">불러오는 중…</p>;
  if (result.error) {
    return (
      <div className="card narrow">
        <p className="error">{result.error}</p>
        <Link to="/rooms">내 방으로</Link>
      </div>
    );
  }

  const { room } = result;
  const isManager = room.role === 'MANAGER';
  const reload = () => setVersion((v) => v + 1);

  let writeBlockedReason = '';
  if (!room.canParticipate) writeBlockedReason = '관리자는 팀 편성에 참여하지 않도록 설정되어 있습니다.';
  else if (room.myTeam) writeBlockedReason = '이미 이 방에서 팀에 소속되어 있습니다.';
  else if (room.isDeadlinePassed) writeBlockedReason = '팀 구성 마감일이 지나 새 모집글을 쓸 수 없습니다.';

  async function leave() {
    if (room.myTeam) {
      const goToTeam = window.confirm(
        room.myTeam.isLeader
          ? '이 방에서 팀장으로 팀에 소속되어 있습니다.\n팀을 해체(게시글 삭제)한 뒤 방을 나갈 수 있습니다.\n\n게시글로 이동할까요?'
          : '이 방에서 팀에 소속되어 있습니다.\n팀 페이지에서 먼저 팀을 나간 뒤 방을 나갈 수 있습니다.\n\n팀 페이지로 이동할까요?'
      );
      if (goToTeam) navigate(room.myTeam.isLeader ? `/posts/${room.myTeam.postId}` : `/posts/${room.myTeam.postId}/team`);
      return;
    }
    if (
      !window.confirm(
        '방을 나가시겠습니까?\n\n· 이 방에서 진행 중인 지원은 취소됩니다.\n· 이 방에 쓴 모집글(팀 구성 전)은 삭제됩니다.\n· 댓글은 남습니다.'
      )
    )
      return;
    try {
      await api.post(`/api/rooms/${room.roomId}/leave`, {});
      navigate('/rooms', { replace: true });
    } catch (err) {
      setMessage(err.message);
    }
  }

  async function saveSettings(values) {
    await api.put(`/api/rooms/${room.roomId}`, values);
    setMessage('설정을 저장했습니다.');
    reload();
  }

  async function regenerateCode() {
    if (!window.confirm('참여 코드를 새로 만들까요?\n이전 코드로는 더 이상 들어올 수 없습니다. (이미 들어온 사람은 그대로)')) return;
    try {
      await api.post(`/api/rooms/${room.roomId}/code`, {});
      reload();
    } catch (err) {
      setMessage(err.message);
    }
  }

  async function removeRoom() {
    if (!window.confirm(`"${room.name}" 방을 삭제하시겠습니까?\n\n방 안의 모집글, 팀, 팀 게시판, 댓글이 모두 삭제되며 되돌릴 수 없습니다.`)) return;
    try {
      await api.delete(`/api/rooms/${room.roomId}`);
      navigate('/rooms', { replace: true });
    } catch (err) {
      setMessage(err.message);
    }
  }

  return (
    <div className="card">
      <Link to="/rooms" className="small">
        ← 내 방
      </Link>
      <div className="title-row room-title">
        <h1>{room.name}</h1>
        {isManager && <span className="badge app-ACCEPTED">관리자</span>}
      </div>
      {room.description && <p className="room-desc">{room.description}</p>}
      <p className="muted small">
        관리자 {room.managerName} · 참여 {room.memberCount}명
        {(room.minTeamSize || room.maxTeamSize) && ` · 팀 인원 ${room.minTeamSize ?? '제한 없음'} ~ ${room.maxTeamSize ?? '제한 없음'}명 (작성자 포함)`}
        {room.teamDeadline && ` · 팀 구성 마감 ${room.teamDeadline}`}
        {room.isDeadlinePassed && ' (지남)'}
      </p>
      {isManager && (
        <p className="join-code">
          참여 코드 <strong>{room.joinCode}</strong>
          <span className="muted small"> · 참여자에게 이 코드를 알려주세요</span>
        </p>
      )}
      {room.myTeam && (
        <p className="notice small">
          이 방에서 <Link to={`/posts/${room.myTeam.postId}`}>{room.myTeam.title}</Link> 팀에 소속되어 있습니다.{' '}
          <Link to={`/posts/${room.myTeam.postId}/team`}>팀 페이지로 가기</Link>
        </p>
      )}

      {isManager && (
        <div className="tabs room-tabs">
          {[
            ['board', '게시판'],
            ['status', '편성 현황'],
            ['settings', '설정'],
          ].map(([value, label]) => (
            <button key={value} type="button" className={tab === value ? 'tab active' : 'tab'} onClick={() => setTab(value)}>
              {label}
            </button>
          ))}
        </div>
      )}

      {message && <p className="notice small">{message}</p>}

      {tab === 'board' && (
        <PostListPage room={{ roomId: room.roomId, canWrite: !writeBlockedReason, writeBlockedReason }} />
      )}
      {tab === 'status' && isManager && <RoomStatus room={room} />}
      {tab === 'settings' && isManager && (
        <>
          <section className="panel">
            <h2>방 설정</h2>
            <RoomForm key={version} initial={room} submitLabel="설정 저장" onSubmit={saveSettings} />
          </section>
          <section className="panel">
            <h2>참여 코드</h2>
            <p>
              현재 코드: <strong className="code-text">{room.joinCode}</strong>
            </p>
            <button type="button" className="secondary" onClick={regenerateCode}>
              참여 코드 재발급
            </button>
          </section>
          <section className="panel danger-zone">
            <h2>방 삭제</h2>
            <p className="muted small">방 안의 모집글, 팀, 팀 게시판이 모두 삭제됩니다.</p>
            <button type="button" className="danger" onClick={removeRoom}>
              방 삭제
            </button>
          </section>
        </>
      )}

      {!isManager && (
        <div className="room-leave">
          <button type="button" className="link small" onClick={leave}>
            방 나가기
          </button>
        </div>
      )}
    </div>
  );
}
