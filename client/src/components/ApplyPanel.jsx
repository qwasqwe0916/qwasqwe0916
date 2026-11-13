import { useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../lib/api';
import { APPLICATION_STATUS_LABELS } from '../lib/format';
import { useAuth } from '../auth/AuthContext';

// 작성자가 아닌 사람에게 보이는 지원 영역 (지원하기 / 내 지원 상태 / 취소)
export default function ApplyPanel({ post, onChanged }) {
  const { profile } = useAuth();
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const mine = post.myApplication;

  async function apply(e) {
    e.preventDefault();
    if (!window.confirm('이 글에 지원하시겠습니까?\n\n거절되면 같은 글에 다시 지원할 수 없습니다.')) return;
    setBusy(true);
    setError('');
    try {
      await api.post(`/api/posts/${post.postId}/applications`, { message });
      setMessage('');
      onChanged();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  async function cancel() {
    if (!window.confirm('지원을 취소하시겠습니까?')) return;
    setBusy(true);
    setError('');
    try {
      await api.delete(`/api/applications/${mine.applicationId}`);
      onChanged();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  let body;
  if (!profile) {
    body = (
      <p className="muted small">
        지원하려면 <Link to="/login">로그인</Link>해 주세요.
      </p>
    );
  } else if (mine) {
    body = (
      <div className="apply-status">
        <span>
          내 지원 상태: <span className={`badge app-${mine.status}`}>{APPLICATION_STATUS_LABELS[mine.status]}</span>
        </span>
        {mine.message && <p className="muted small">보낸 메시지: {mine.message}</p>}
        {mine.status === 'ACCEPTED' && !post.teamFormed && (
          <p className="notice small">수락되었습니다. 작성자가 팀을 구성하면 팀 페이지가 열립니다.</p>
        )}
        {mine.status === 'ACCEPTED' && post.teamFormed && (
          <p className="notice small">
            팀이 구성되었습니다. 위의 "팀 페이지로 가기"에서 팀원 연락처와 팀 게시판을 확인하세요.
            {post.author.revealed && ` (익명 작성자의 실명: ${post.author.name})`}
          </p>
        )}
        {mine.status === 'PENDING' && (
          <button type="button" className="secondary" onClick={cancel} disabled={busy}>
            지원 취소
          </button>
        )}
      </div>
    );
  } else if (post.status !== 'OPEN') {
    body = <p className="muted small">모집이 완료된 글입니다.</p>;
  } else if (post.isExpired) {
    body = <p className="muted small">마감일이 지난 글입니다.</p>;
  } else {
    body = (
      <form onSubmit={apply} className="form">
        <textarea
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          maxLength={300}
          rows={3}
          placeholder="지원 메시지 (선택, 300자 이하) 예: 맡고 싶은 역할, 관련 경험"
        />
        <button type="submit" disabled={busy}>
          {busy ? '지원 중…' : '지원하기'}
        </button>
      </form>
    );
  }

  return (
    <section className="panel">
      <h2>지원</h2>
      {body}
      {error && <p className="error">{error}</p>}
    </section>
  );
}
