import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../lib/api';
import { APPLICATION_STATUS_LABELS, STATUS_LABELS, formatDate } from '../lib/format';

// 마이페이지: 내가 쓴 글(지원 현황) / 내 지원 현황
export default function MyPage() {
  const [tab, setTab] = useState('posts');
  const [data, setData] = useState({ loaded: false, posts: [], applications: [], error: '' });

  useEffect(() => {
    let cancelled = false;
    Promise.all([api.get('/api/me/posts'), api.get('/api/me/applications')])
      .then(([posts, applications]) => !cancelled && setData({ loaded: true, posts, applications, error: '' }))
      .catch((err) => !cancelled && setData({ loaded: true, posts: [], applications: [], error: err.message }));
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div className="card">
      <h1>마이페이지</h1>
      <div className="tabs mypage-tabs">
        <button type="button" className={tab === 'posts' ? 'tab active' : 'tab'} onClick={() => setTab('posts')}>
          내가 쓴 글 {data.loaded && data.posts.length}
        </button>
        <button
          type="button"
          className={tab === 'applications' ? 'tab active' : 'tab'}
          onClick={() => setTab('applications')}
        >
          내 지원 현황 {data.loaded && data.applications.length}
        </button>
      </div>

      {!data.loaded ? (
        <p className="muted">불러오는 중…</p>
      ) : data.error ? (
        <p className="error">{data.error}</p>
      ) : tab === 'posts' ? (
        data.posts.length === 0 ? (
          <p className="muted">작성한 글이 없습니다. <Link to="/posts/new">글쓰기</Link></p>
        ) : (
          <ul className="post-list">
            {data.posts.map((post) => (
              <li key={post.postId}>
                <Link to={`/posts/${post.postId}`} className="post-item">
                  <div className="badges">
                    <span className="badge">{post.category}</span>
                    <span className={`badge status-${post.status}`}>{STATUS_LABELS[post.status]}</span>
                    {post.isAnonymous && <span className="badge">익명</span>}
                    {post.teamFormed && <span className="badge app-ACCEPTED">팀 구성됨</span>}
                    {post.applications.pending > 0 && (
                      <span className="badge app-PENDING">새 지원 {post.applications.pending}</span>
                    )}
                  </div>
                  <strong className="post-title">{post.title}</strong>
                  <span className="muted small">
                    지원 {post.applications.total}명 · 수락 {post.applications.accepted} / 모집 {post.recruitCount}명 ·{' '}
                    {formatDate(post.createdAt)}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )
      ) : data.applications.length === 0 ? (
        <p className="muted">지원한 글이 없습니다.</p>
      ) : (
        <ul className="post-list">
          {data.applications.map((app) => (
            <li key={app.applicationId}>
              <Link to={`/posts/${app.post.postId}`} className="post-item">
                <div className="badges">
                  <span className="badge">{app.post.category}</span>
                  <span className={`badge status-${app.post.status}`}>{STATUS_LABELS[app.post.status]}</span>
                  <span className={`badge app-${app.status}`}>내 지원: {APPLICATION_STATUS_LABELS[app.status]}</span>
                  {app.status === 'ACCEPTED' && app.teamFormed && <span className="badge app-ACCEPTED">팀 구성됨</span>}
                </div>
                <strong className="post-title">{app.post.title}</strong>
                <span className="muted small">
                  작성자 {app.author.name}
                  {app.author.department && ` (${app.author.department})`}
                  {app.author.revealed && ' · 팀 구성으로 실명 공개'} · 지원일 {formatDate(app.appliedAt)}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
