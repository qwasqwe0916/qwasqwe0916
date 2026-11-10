import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { api } from '../lib/api';
import { STATUS_LABELS, formatDate, formatDeadline } from '../lib/format';
import { useAuth } from '../auth/AuthContext';

// 게시글 상세. 작성자에게만 모집 상태 변경, 수정, 삭제 버튼이 보인다.
export default function PostDetailPage() {
  const { id } = useParams();
  const { profile } = useAuth();
  const navigate = useNavigate();

  const [result, setResult] = useState({ id: null, post: null, error: '' });
  const [actionError, setActionError] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let cancelled = false;
    api
      .get(`/api/posts/${id}`)
      .then((post) => !cancelled && setResult({ id, post, error: '' }))
      .catch((err) => !cancelled && setResult({ id, post: null, error: err.message }));
    return () => {
      cancelled = true;
    };
  }, [id]);

  if (result.id !== id) return <p className="muted center">불러오는 중…</p>;
  if (result.error) {
    return (
      <div className="card narrow">
        <p className="error">{result.error}</p>
        <Link to="/">목록으로</Link>
      </div>
    );
  }

  const { post } = result;
  const isOwner = profile?.userId === post.author.userId;

  async function toggleStatus() {
    const next = post.status === 'OPEN' ? 'CLOSED' : 'OPEN';
    setBusy(true);
    setActionError('');
    try {
      setResult({ id, post: await api.patch(`/api/posts/${id}/status`, { status: next }), error: '' });
    } catch (err) {
      setActionError(err.message);
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    if (!window.confirm('게시글을 삭제하시겠습니까?\n\n댓글과 지원 내역도 함께 삭제되며 되돌릴 수 없습니다.')) return;
    setBusy(true);
    try {
      await api.delete(`/api/posts/${id}`);
      navigate('/', { replace: true });
    } catch (err) {
      setActionError(err.message);
      setBusy(false);
    }
  }

  return (
    <div className="card">
      <Link to="/" className="small">
        ← 목록으로
      </Link>
      <div className="badges detail-badges">
        <span className="badge">{post.category.name}</span>
        <span className={`badge status-${post.status}`}>{STATUS_LABELS[post.status]}</span>
      </div>
      <h1>{post.title}</h1>
      <p className="muted small">
        {post.author.name}
        {post.author.department && ` (${post.author.department})`} · 작성 {formatDate(post.createdAt)}
        {post.updatedAt !== post.createdAt && ` · 수정 ${formatDate(post.updatedAt)}`}
      </p>

      <dl className="info">
        <dt>모집 인원</dt>
        <dd>{post.recruitCount}명</dd>
        <dt>마감일</dt>
        <dd>{formatDeadline(post.deadline)}</dd>
      </dl>

      <div className="content">{post.content}</div>

      {isOwner && (
        <div className="actions owner-actions">
          <button type="button" className="secondary" onClick={toggleStatus} disabled={busy}>
            {post.status === 'OPEN' ? '모집완료로 변경' : '모집중으로 변경'}
          </button>
          <Link to={`/posts/${id}/edit`} className="button secondary">
            수정
          </Link>
          <button type="button" className="danger" onClick={remove} disabled={busy}>
            삭제
          </button>
        </div>
      )}
      {actionError && <p className="error">{actionError}</p>}
    </div>
  );
}
