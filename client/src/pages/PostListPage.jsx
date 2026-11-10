import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { api } from '../lib/api';
import { useOptions } from '../lib/useOptions';
import SkillPicker from '../components/SkillPicker';
import SkillTags from '../components/SkillTags';
import { STATUS_LABELS, formatDate, formatDeadline } from '../lib/format';
import { useAuth } from '../auth/AuthContext';

// 메인: 모집 게시글 목록 (카테고리 탭, 모집중만 보기)
export default function PostListPage() {
  const { profile } = useAuth();
  const categories = useOptions('/api/categories');
  const skillOptions = useOptions('/api/skills');
  const [searchParams, setSearchParams] = useSearchParams();
  const category = searchParams.get('category') ?? '';
  const openOnly = searchParams.get('status') === 'OPEN';
  const selectedSkills = (searchParams.get('skills') ?? '').split(',').filter(Boolean).map(Number);

  const [result, setResult] = useState({ key: null, posts: [], error: '' });
  const key = searchParams.toString();

  useEffect(() => {
    let cancelled = false;
    api
      .get(`/api/posts?${key}`)
      .then((posts) => !cancelled && setResult({ key, posts, error: '' }))
      .catch((err) => !cancelled && setResult({ key, posts: [], error: err.message }));
    return () => {
      cancelled = true;
    };
  }, [key]);

  function updateFilter(name, value) {
    const next = new URLSearchParams(searchParams);
    if (value) next.set(name, value);
    else next.delete(name);
    setSearchParams(next);
  }

  const loading = result.key !== key;

  return (
    <div className="card">
      <div className="title-row">
        <h1>모집 게시판</h1>
        {profile ? (
          <Link to="/posts/new" className="button">
            글쓰기
          </Link>
        ) : (
          <span className="muted small">
            글을 쓰려면 <Link to="/login">로그인</Link>해 주세요.
          </span>
        )}
      </div>

      <div className="filters">
        <div className="tabs">
          <button type="button" className={category === '' ? 'tab active' : 'tab'} onClick={() => updateFilter('category', '')}>
            전체
          </button>
          {categories.map((c) => (
            <button
              type="button"
              key={c.categoryId}
              className={category === String(c.categoryId) ? 'tab active' : 'tab'}
              onClick={() => updateFilter('category', String(c.categoryId))}
            >
              {c.name}
            </button>
          ))}
        </div>
        <label className="checkbox">
          <input type="checkbox" checked={openOnly} onChange={(e) => updateFilter('status', e.target.checked ? 'OPEN' : '')} />
          모집중만 보기
        </label>
      </div>

      <details className="skill-filter" open={selectedSkills.length > 0}>
        <summary>기술로 찾기{selectedSkills.length > 0 && ` (${selectedSkills.length}개 선택)`}</summary>
        <SkillPicker
          skills={skillOptions}
          selectedIds={selectedSkills}
          onChange={(ids) => updateFilter('skills', ids.join(','))}
        />
        <p className="muted small">선택한 기술 중 하나라도 필요한 글을 보여줍니다.</p>
      </details>

      {loading ? (
        <p className="muted">불러오는 중…</p>
      ) : result.error ? (
        <p className="error">{result.error}</p>
      ) : result.posts.length === 0 ? (
        <p className="muted">게시글이 없습니다.</p>
      ) : (
        <ul className="post-list">
          {result.posts.map((post) => (
            <li key={post.postId}>
              <Link to={`/posts/${post.postId}`} className="post-item">
                <div className="badges">
                  <span className="badge">{post.category.name}</span>
                  <span className={`badge status-${post.status}`}>{STATUS_LABELS[post.status]}</span>
                </div>
                <strong className="post-title">{post.title}</strong>
                {post.skills.length > 0 && <SkillTags skills={post.skills} />}
                <span className="muted small">
                  {post.author.name}
                  {post.isAnonymous && post.author.department && ` (${post.author.department})`} · 모집 {post.recruitCount}명 · 마감 {formatDeadline(post.deadline)} · {formatDate(post.createdAt)}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
