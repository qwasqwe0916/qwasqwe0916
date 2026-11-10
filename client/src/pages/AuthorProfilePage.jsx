import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { api } from '../lib/api';

// 게시글 작성자 프로필 (R15). 익명 글이면 학과(와 이후 추가될 기술 스택)만 보인다.
export default function AuthorProfilePage() {
  const { id } = useParams();
  const [result, setResult] = useState({ id: null, author: null, error: '' });

  useEffect(() => {
    let cancelled = false;
    api
      .get(`/api/posts/${id}/author`)
      .then((author) => !cancelled && setResult({ id, author, error: '' }))
      .catch((err) => !cancelled && setResult({ id, author: null, error: err.message }));
    return () => {
      cancelled = true;
    };
  }, [id]);

  if (result.id !== id) return <p className="muted center">불러오는 중…</p>;

  const { author } = result;
  return (
    <div className="card narrow">
      <Link to={`/posts/${id}`} className="small">
        ← 게시글로
      </Link>
      {result.error ? (
        <p className="error">{result.error}</p>
      ) : (
        <>
          <h1 className="profile-title">{author.anonymous ? '익명 작성자' : author.name}</h1>
          {author.anonymous && <p className="muted small">익명 글의 작성자는 학과와 기술 스택만 공개됩니다.</p>}
          <dl className="info">
            {!author.anonymous && (
              <>
                <dt>이름</dt>
                <dd>{author.name}</dd>
              </>
            )}
            <dt>학과</dt>
            <dd>{author.department || <span className="muted">미입력</span>}</dd>
            {!author.anonymous && (
              <>
                <dt>GitHub</dt>
                <dd>
                  {author.githubUrl ? (
                    <a href={author.githubUrl} target="_blank" rel="noreferrer">
                      {author.githubUrl.replace('https://', '')}
                    </a>
                  ) : (
                    <span className="muted">미입력</span>
                  )}
                </dd>
              </>
            )}
            <dt>기술 스택</dt>
            <dd className="muted">다음 단계에서 추가됩니다</dd>
          </dl>
        </>
      )}
    </div>
  );
}
