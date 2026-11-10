import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../lib/api';
import { formatDate } from '../lib/format';
import { useAuth } from '../auth/AuthContext';

// 게시글 상세 아래의 댓글 영역
// forceAnonymous: 익명 글의 작성자 본인이면 댓글이 항상 "익명(작성자)"로 표시된다 (R25)
export default function Comments({ postId, forceAnonymous }) {
  const { profile } = useAuth();
  const [result, setResult] = useState({ postId: null, comments: [], error: '' });
  const [content, setContent] = useState('');
  const [isAnonymous, setIsAnonymous] = useState(false);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let cancelled = false;
    api
      .get(`/api/posts/${postId}/comments`)
      .then((comments) => !cancelled && setResult({ postId, comments, error: '' }))
      .catch((err) => !cancelled && setResult({ postId, comments: [], error: err.message }));
    return () => {
      cancelled = true;
    };
  }, [postId]);

  async function submit(e) {
    e.preventDefault();
    if (!content.trim()) return setError('댓글 내용을 입력해 주세요.');
    setBusy(true);
    setError('');
    try {
      const comments = await api.post(`/api/posts/${postId}/comments`, { content, isAnonymous });
      setResult({ postId, comments, error: '' });
      setContent('');
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  async function remove(commentId) {
    if (!window.confirm('댓글을 삭제하시겠습니까?')) return;
    try {
      await api.delete(`/api/comments/${commentId}`);
      // 익명 번호가 다시 매겨질 수 있으므로 목록을 새로 받는다
      setResult({ postId, comments: await api.get(`/api/posts/${postId}/comments`), error: '' });
    } catch (err) {
      setError(err.message);
    }
  }

  const loading = result.postId !== postId;

  return (
    <section className="comments">
      <h2>댓글 {loading ? '' : result.comments.length}</h2>

      {loading ? (
        <p className="muted">불러오는 중…</p>
      ) : result.error ? (
        <p className="error">{result.error}</p>
      ) : result.comments.length === 0 ? (
        <p className="muted small">아직 댓글이 없습니다.</p>
      ) : (
        <ul className="comment-list">
          {result.comments.map((comment) => (
            <li key={comment.commentId}>
              <div className="comment-head">
                <Link to={`/comments/${comment.commentId}/author`} className="comment-author">
                  {comment.author.name}
                </Link>
                {comment.author.department && <span className="muted small">{comment.author.department}</span>}
                {comment.isPostAuthor && !comment.author.anonymous && <span className="badge">작성자</span>}
                <span className="muted small">{formatDate(comment.createdAt)}</span>
                {comment.isMine && (
                  <button type="button" className="link small comment-delete" onClick={() => remove(comment.commentId)}>
                    삭제
                  </button>
                )}
              </div>
              <p className="comment-content">{comment.content}</p>
            </li>
          ))}
        </ul>
      )}

      {profile ? (
        <form onSubmit={submit} className="form comment-form">
          <textarea
            value={content}
            onChange={(e) => setContent(e.target.value)}
            maxLength={1000}
            rows={3}
            placeholder="댓글을 입력하세요"
          />
          <div className="comment-form-row">
            <label className="checkbox">
              <input
                type="checkbox"
                checked={forceAnonymous || isAnonymous}
                disabled={forceAnonymous}
                onChange={(e) => setIsAnonymous(e.target.checked)}
              />
              익명으로 작성
              {forceAnonymous && <span className="muted small">(익명 글의 작성자는 댓글도 "익명(작성자)"로 표시됩니다)</span>}
            </label>
            <button type="submit" disabled={busy}>
              {busy ? '등록 중…' : '댓글 등록'}
            </button>
          </div>
        </form>
      ) : (
        <p className="muted small">
          댓글을 쓰려면 <Link to="/login">로그인</Link>해 주세요.
        </p>
      )}
      {error && <p className="error">{error}</p>}
    </section>
  );
}
