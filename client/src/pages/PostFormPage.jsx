import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { api } from '../lib/api';
import { useCategories } from '../lib/useCategories';
import { useAuth } from '../auth/AuthContext';

const EMPTY = { categoryId: '', title: '', content: '', recruitCount: 1, deadline: '' };

// 게시글 작성(/posts/new) · 수정(/posts/:id/edit)
export default function PostFormPage() {
  const { id } = useParams();
  const isEdit = Boolean(id);
  const { profile } = useAuth();
  const categories = useCategories();
  const navigate = useNavigate();

  const [form, setForm] = useState(EMPTY);
  const [loadedId, setLoadedId] = useState(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  // 수정 화면이면 기존 내용을 불러온다
  useEffect(() => {
    if (!isEdit) return;
    let cancelled = false;
    api
      .get(`/api/posts/${id}`)
      .then((post) => {
        if (cancelled) return;
        if (post.author.userId !== profile?.userId) {
          setError('작성자만 수정할 수 있습니다.');
        } else {
          setForm({
            categoryId: String(post.category.categoryId),
            title: post.title,
            content: post.content,
            recruitCount: post.recruitCount,
            deadline: post.deadline ?? '',
          });
        }
        setLoadedId(id);
      })
      .catch((err) => {
        if (cancelled) return;
        setError(err.message);
        setLoadedId(id);
      });
    return () => {
      cancelled = true;
    };
  }, [id, isEdit, profile?.userId]);

  const update = (field) => (e) => setForm({ ...form, [field]: e.target.value });

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    if (!form.categoryId) return setError('카테고리를 선택해 주세요.');
    if (!form.title.trim()) return setError('제목을 입력해 주세요.');
    if (!form.content.trim()) return setError('내용을 입력해 주세요.');

    const body = { ...form, categoryId: Number(form.categoryId), recruitCount: Number(form.recruitCount) };
    setBusy(true);
    try {
      const saved = isEdit ? await api.put(`/api/posts/${id}`, body) : await api.post('/api/posts', body);
      navigate(`/posts/${saved.postId}`, { replace: true });
    } catch (err) {
      setError(err.message);
      setBusy(false);
    }
  }

  if (isEdit && loadedId !== id) return <p className="muted center">불러오는 중…</p>;
  if (isEdit && !form.title && error) {
    return (
      <div className="card narrow">
        <p className="error">{error}</p>
        <Link to="/">목록으로</Link>
      </div>
    );
  }

  return (
    <div className="card form-card">
      <h1>{isEdit ? '게시글 수정' : '모집 글쓰기'}</h1>
      <form onSubmit={handleSubmit} className="form">
        <label>
          <span>
            카테고리 <span className="required">*</span>
          </span>
          <select value={form.categoryId} onChange={update('categoryId')} required>
            <option value="">선택해 주세요</option>
            {categories.map((c) => (
              <option key={c.categoryId} value={c.categoryId}>
                {c.name}
              </option>
            ))}
          </select>
        </label>
        <label>
          <span>
            제목 <span className="required">*</span>
          </span>
          <input value={form.title} onChange={update('title')} maxLength={100} required />
        </label>
        <div className="field-row">
          <label>
            <span>
              모집 인원 <span className="required">*</span>
            </span>
            <input type="number" min={1} max={100} value={form.recruitCount} onChange={update('recruitCount')} required />
          </label>
          <label>
            마감일
            <input type="date" value={form.deadline} onChange={update('deadline')} />
          </label>
        </div>
        <label>
          <span>
            내용 <span className="required">*</span>
          </span>
          <textarea
            value={form.content}
            onChange={update('content')}
            maxLength={5000}
            rows={10}
            placeholder="프로젝트 소개, 모집 역할, 진행 방식 등을 적어 주세요."
            required
          />
        </label>
        <div className="actions">
          <button type="submit" disabled={busy}>
            {busy ? '저장 중…' : isEdit ? '저장하기' : '등록하기'}
          </button>
          <button type="button" className="secondary" onClick={() => navigate(-1)} disabled={busy}>
            취소
          </button>
        </div>
      </form>
      {error && <p className="error">{error}</p>}
    </div>
  );
}
