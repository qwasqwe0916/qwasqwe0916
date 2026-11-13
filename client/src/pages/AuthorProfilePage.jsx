import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { api } from '../lib/api';
import SkillTags from '../components/SkillTags';

// 게시글·댓글 작성자 프로필 (R15). 익명이면 학과와 기술 스택만 보인다.
// kind: 'posts' | 'comments' | 'applications'
export default function AuthorProfilePage({ kind }) {
  const { id } = useParams();
  const key = `${kind}/${id}`;
  const [result, setResult] = useState({ id: null, author: null, error: '' });

  useEffect(() => {
    let cancelled = false;
    api
      .get(kind === 'applications' ? `/api/applications/${id}/applicant` : `/api/${key}/author`)
      .then((author) => !cancelled && setResult({ id: key, author, error: '' }))
      .catch((err) => !cancelled && setResult({ id: key, author: null, error: err.message }));
    return () => {
      cancelled = true;
    };
  }, [key, kind, id]);

  if (result.id !== key) return <p className="muted center">불러오는 중…</p>;

  const { author } = result;
  return (
    <div className="card narrow">
      <Link to={author ? `/posts/${author.postId}` : '/'} className="small">
        ← 게시글로
      </Link>
      {result.error ? (
        <p className="error">{result.error}</p>
      ) : (
        <>
          <h1 className="profile-title">{author.name}</h1>
          {author.anonymous && <p className="muted small">익명 작성자는 학과와 기술 스택만 공개됩니다.</p>}
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
            <dd>
              <SkillTags skills={author.skills} emptyText="미입력" />
            </dd>
          </dl>
        </>
      )}
    </div>
  );
}
