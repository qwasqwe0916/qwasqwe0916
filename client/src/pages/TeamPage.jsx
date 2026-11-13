import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { api } from '../lib/api';
import { formatDate } from '../lib/format';
import SkillTags from '../components/SkillTags';

const LINK_NAMES = { 'open.kakao.com': '카카오톡 오픈채팅', 'discord.gg': '디스코드', 'discord.com': '디스코드' };

function linkName(url) {
  const host = new URL(url).hostname.replace(/^www\./, '');
  return LINK_NAMES[host] ?? '연락 링크';
}

// 팀 페이지 (R29): 팀 구성 후 작성자와 수락된 팀원만 들어올 수 있다
export default function TeamPage() {
  const { id } = useParams();
  const [team, setTeam] = useState({ id: null, data: null, error: '' });
  const [messages, setMessages] = useState([]);
  const [content, setContent] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let cancelled = false;
    Promise.all([api.get(`/api/posts/${id}/team`), api.get(`/api/posts/${id}/team/messages`)])
      .then(([data, list]) => {
        if (cancelled) return;
        setTeam({ id, data, error: '' });
        setMessages(list);
      })
      .catch((err) => !cancelled && setTeam({ id, data: null, error: err.message }));
    return () => {
      cancelled = true;
    };
  }, [id]);

  async function send(e) {
    e.preventDefault();
    if (!content.trim()) return setError('내용을 입력해 주세요.');
    setBusy(true);
    setError('');
    try {
      setMessages(await api.post(`/api/posts/${id}/team/messages`, { content }));
      setContent('');
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  async function remove(messageId) {
    if (!window.confirm('이 글을 삭제하시겠습니까?')) return;
    try {
      await api.delete(`/api/team-messages/${messageId}`);
      setMessages(messages.filter((m) => m.messageId !== messageId));
    } catch (err) {
      setError(err.message);
    }
  }

  if (team.id !== id) return <p className="muted center">불러오는 중…</p>;
  if (team.error) {
    return (
      <div className="card narrow">
        <p className="error">{team.error}</p>
        <Link to={`/posts/${id}`}>게시글로</Link>
      </div>
    );
  }

  const { data } = team;
  return (
    <div className="card">
      <Link to={`/posts/${id}`} className="small">
        ← 게시글로
      </Link>
      <h1 className="profile-title">팀 페이지</h1>
      <p className="muted small">
        {data.category} · {data.title} · 팀 구성 {formatDate(data.formedAt)} · 팀원 {data.members.length}명
      </p>

      <section className="panel">
        <h2>연락 링크</h2>
        {data.contactLink ? (
          <>
            <a href={data.contactLink} target="_blank" rel="noopener noreferrer" className="button contact-link">
              {linkName(data.contactLink)} 참여하기
            </a>
            <p className="caution small">
              ⚠️ 외부 서비스로 이동합니다. 채팅방에서 개인정보나 금전을 요구하는 경우 응하지 마세요.
            </p>
          </>
        ) : (
          <p className="muted small">
            등록된 연락 링크가 없습니다. 아래 이메일이나 팀 게시판으로 연락해 보세요.
            {data.isLeader && (
              <>
                {' '}
                <Link to={`/posts/${id}/edit`}>글 수정</Link>에서 카카오톡 오픈채팅이나 디스코드 링크를 등록하면 팀원
                모두에게 보입니다.
              </>
            )}
          </p>
        )}
      </section>

      <section className="panel">
        <h2>팀원</h2>
        <ul className="member-list">
          {data.members.map((member) => (
            <li key={member.userId}>
              <div className="applicant-head">
                <strong>{member.name}</strong>
                <span className="badge">{member.role === 'LEADER' ? '작성자' : '팀원'}</span>
                {member.isMe && <span className="muted small">(나)</span>}
                {member.department && <span className="muted small">{member.department}</span>}
              </div>
              <div className="member-contact small">
                <a href={`mailto:${member.email}`}>{member.email}</a>
                {member.githubUrl && (
                  <a href={member.githubUrl} target="_blank" rel="noreferrer">
                    GitHub
                  </a>
                )}
              </div>
              <SkillTags skills={member.skills} emptyText="등록한 기술 스택 없음" />
            </li>
          ))}
        </ul>
      </section>

      <section className="panel">
        <h2>팀 게시판</h2>
        <p className="muted small hint-text">팀원끼리만 보이는 게시판입니다. 첫 회의 일정이나 연락 방법을 정해 보세요.</p>
        {messages.length === 0 ? (
          <p className="muted small">아직 글이 없습니다.</p>
        ) : (
          <ul className="comment-list">
            {messages.map((m) => (
              <li key={m.messageId}>
                <div className="comment-head">
                  <span className="comment-author">{m.author.name}</span>
                  <span className="muted small">{formatDate(m.createdAt)}</span>
                  {m.isMine && (
                    <button type="button" className="link small comment-delete" onClick={() => remove(m.messageId)}>
                      삭제
                    </button>
                  )}
                </div>
                <p className="comment-content">{m.content}</p>
              </li>
            ))}
          </ul>
        )}
        <form onSubmit={send} className="form comment-form">
          <textarea
            value={content}
            onChange={(e) => setContent(e.target.value)}
            maxLength={1000}
            rows={3}
            placeholder="팀원에게 남길 말을 입력하세요"
          />
          <div className="comment-form-row">
            <span />
            <button type="submit" disabled={busy}>
              {busy ? '등록 중…' : '등록'}
            </button>
          </div>
        </form>
        {error && <p className="error">{error}</p>}
      </section>
    </div>
  );
}
