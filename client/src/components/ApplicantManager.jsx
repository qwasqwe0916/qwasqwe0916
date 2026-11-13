import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../lib/api';
import { APPLICATION_STATUS_LABELS, formatDate } from '../lib/format';
import SkillTags from './SkillTags';

// 글 작성자에게 보이는 지원자 관리 (R20). 지원자의 기술 스택 전체와 수락/거절 버튼
export default function ApplicantManager({ post, onChanged }) {
  const [result, setResult] = useState({ key: null, applications: [], error: '' });
  const [version, setVersion] = useState(0);
  const [error, setError] = useState('');
  const [busyId, setBusyId] = useState(null);
  const key = `${post.postId}:${version}`;

  useEffect(() => {
    let cancelled = false;
    api
      .get(`/api/posts/${post.postId}/applications`)
      .then((applications) => !cancelled && setResult({ key, applications, error: '' }))
      .catch((err) => !cancelled && setResult({ key, applications: [], error: err.message }));
    return () => {
      cancelled = true;
    };
  }, [post.postId, key]);

  async function formTeam() {
    const pending = applications.filter((app) => app.status === 'PENDING').length;
    const message =
      `현재 수락한 ${post.acceptedCount}명(모집 ${post.recruitCount}명)으로 팀을 구성합니다.\n\n` +
      '· 구성 후에는 지원 상태를 바꿀 수 없습니다.\n' +
      '· 글은 모집완료로 바뀝니다.\n' +
      (pending > 0 ? `· 대기 중인 지원 ${pending}건은 자동으로 거절됩니다.\n` : '') +
      '· 팀원끼리 이메일과 연락 링크가 공개되고 팀 게시판이 열립니다.';
    if (!window.confirm(message)) return;
    setBusyId('team');
    setError('');
    try {
      await api.post(`/api/posts/${post.postId}/team`, {});
      setVersion((v) => v + 1);
      onChanged();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusyId(null);
    }
  }

  async function decide(applicationId, status) {
    setBusyId(applicationId);
    setError('');
    try {
      await api.patch(`/api/applications/${applicationId}`, { status });
      setVersion((v) => v + 1);
      onChanged();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusyId(null);
    }
  }

  const { applications } = result;

  return (
    <section className="panel">
      <h2>
        지원자 관리{' '}
        <span className="muted small">
          수락 {post.acceptedCount} / 모집 {post.recruitCount}명 · 지원 {post.applicationCount}명
        </span>
      </h2>
      {result.key !== key && applications.length === 0 ? (
        <p className="muted">불러오는 중…</p>
      ) : result.error ? (
        <p className="error">{result.error}</p>
      ) : applications.length === 0 ? (
        <p className="muted small">아직 지원자가 없습니다.</p>
      ) : (
        <ul className="applicant-list">
          {applications.map((app) => (
            <li key={app.applicationId}>
              <div className="applicant-head">
                <Link to={`/applications/${app.applicationId}/applicant`} className="applicant-name">
                  {app.applicant.name}
                </Link>
                {app.applicant.department && <span className="muted small">{app.applicant.department}</span>}
                {app.applicant.githubUrl && (
                  <a href={app.applicant.githubUrl} target="_blank" rel="noreferrer" className="small">
                    GitHub
                  </a>
                )}
                <span className={`badge app-${app.status}`}>{APPLICATION_STATUS_LABELS[app.status]}</span>
                <span className="muted small">{formatDate(app.appliedAt)}</span>
              </div>
              <div className="applicant-skills">
                <SkillTags skills={app.applicant.skills} emptyText="등록한 기술 스택 없음" />
              </div>
              {app.message && <p className="applicant-message">{app.message}</p>}
              {!post.teamFormed && (
              <div className="actions">
                {app.status !== 'ACCEPTED' && (
                  <button type="button" onClick={() => decide(app.applicationId, 'ACCEPTED')} disabled={busyId !== null}>
                    수락
                  </button>
                )}
                {app.status !== 'REJECTED' && (
                  <button
                    type="button"
                    className="danger"
                    onClick={() => decide(app.applicationId, 'REJECTED')}
                    disabled={busyId !== null}
                  >
                    거절
                  </button>
                )}
                {app.status !== 'PENDING' && (
                  <button
                    type="button"
                    className="secondary"
                    onClick={() => decide(app.applicationId, 'PENDING')}
                    disabled={busyId !== null}
                  >
                    대기로 되돌리기
                  </button>
                )}
              </div>
              )}
            </li>
          ))}
        </ul>
      )}
      {post.teamFormed ? (
        <p className="notice small">팀이 구성되었습니다. 지원 상태는 더 이상 바꿀 수 없습니다.</p>
      ) : (
        <div className="team-form">
          <button type="button" onClick={formTeam} disabled={busyId !== null || post.acceptedCount < 1}>
            팀 구성하기
          </button>
          <span className="muted small">
            {post.acceptedCount < 1
              ? '지원자를 1명 이상 수락하면 팀을 구성할 수 있습니다.'
              : '수락만으로는 연락처가 공개되지 않습니다. 팀을 구성해야 팀 페이지가 열립니다.'}
          </span>
        </div>
      )}
      {error && <p className="error">{error}</p>}
    </section>
  );
}
