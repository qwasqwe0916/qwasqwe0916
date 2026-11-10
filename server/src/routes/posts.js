import { Router } from 'express';
import { pool } from '../db.js';
import { requireUser } from '../middleware/auth.js';

const router = Router();
const STATUSES = ['OPEN', 'CLOSED'];

const SELECT_POST = `
  SELECT p.post_id, p.title, p.content, p.recruit_count, p.deadline, p.status, p.is_anonymous,
         p.created_at, p.updated_at,
         c.category_id, c.name AS category_name,
         u.user_id, u.name AS author_name, u.department AS author_department
  FROM posts p
  JOIN categories c ON c.category_id = p.category_id
  JOIN users u      ON u.user_id = p.user_id`;

// 익명 글은 작성자 이름과 ID를 응답에서 빼고 학과만 보낸다 (R24)
function toAuthor(row) {
  if (row.is_anonymous) return { anonymous: true, name: '익명', department: row.author_department };
  return { anonymous: false, userId: row.user_id, name: row.author_name, department: row.author_department };
}

// viewer: 요청한 회원(req.user). isMine으로 "내 글인지"를 알려준다
function toPost(row, viewer, { withContent = true } = {}) {
  return {
    postId: row.post_id,
    title: row.title,
    ...(withContent && { content: row.content }),
    recruitCount: row.recruit_count,
    deadline: row.deadline,
    status: row.status,
    isAnonymous: Boolean(row.is_anonymous),
    isMine: Boolean(viewer) && viewer.user_id === row.user_id,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    category: { categoryId: row.category_id, name: row.category_name },
    author: toAuthor(row),
  };
}

async function findPost(postId) {
  const [rows] = await pool.query(`${SELECT_POST} WHERE p.post_id = ?`, [postId]);
  return rows[0] ?? null;
}

// 입력값 검사. 문제가 있으면 오류 메시지를, 없으면 정리된 값을 돌려준다.
function validatePost(body) {
  const title = String(body.title ?? '').trim();
  const content = String(body.content ?? '').trim();
  const categoryId = Number(body.categoryId);
  const recruitCount = Number(body.recruitCount);
  const deadline = body.deadline ? String(body.deadline) : null;
  const isAnonymous = body.isAnonymous === true;

  if (!Number.isInteger(categoryId)) return { error: '카테고리를 선택해 주세요.' };
  if (!title) return { error: '제목을 입력해 주세요.' };
  if (title.length > 100) return { error: '제목은 100자 이하로 입력해 주세요.' };
  if (!content) return { error: '내용을 입력해 주세요.' };
  if (content.length > 5000) return { error: '내용은 5000자 이하로 입력해 주세요.' };
  if (!Number.isInteger(recruitCount) || recruitCount < 1 || recruitCount > 100) {
    return { error: '모집 인원은 1 ~ 100명 사이로 입력해 주세요.' };
  }
  if (deadline && (!/^\d{4}-\d{2}-\d{2}$/.test(deadline) || Number.isNaN(Date.parse(deadline)))) {
    return { error: '마감일 형식이 올바르지 않습니다.' };
  }
  return { value: { title, content, categoryId, recruitCount, deadline, isAnonymous } };
}

async function categoryExists(categoryId) {
  const [rows] = await pool.query('SELECT 1 FROM categories WHERE category_id = ?', [categoryId]);
  return rows.length > 0;
}

// 작성자 본인인지 확인 (R9). 글이 없으면 404, 본인이 아니면 403
async function loadOwnPost(req, res) {
  const post = await findPost(req.params.id);
  if (!post) {
    res.status(404).json({ message: '게시글을 찾을 수 없습니다.' });
    return null;
  }
  if (post.user_id !== req.user.user_id) {
    res.status(403).json({ message: '작성자만 할 수 있습니다.' });
    return null;
  }
  return post;
}

// 게시글 목록 (R11: 비회원도 조회 가능, R12: 카테고리 필터). 최신순
router.get('/', async (req, res) => {
  const conditions = [];
  const params = [];
  const categoryId = Number(req.query.category);
  if (req.query.category && Number.isInteger(categoryId)) {
    conditions.push('p.category_id = ?');
    params.push(categoryId);
  }
  if (STATUSES.includes(req.query.status)) {
    conditions.push('p.status = ?');
    params.push(req.query.status);
  }
  const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
  const [rows] = await pool.query(`${SELECT_POST} ${where} ORDER BY p.created_at DESC, p.post_id DESC`, params);
  res.json(rows.map((row) => toPost(row, req.user, { withContent: false })));
});

// 게시글 상세 (R11)
router.get('/:id', async (req, res) => {
  const post = await findPost(req.params.id);
  if (!post) return res.status(404).json({ message: '게시글을 찾을 수 없습니다.' });
  res.json(toPost(post, req.user));
});

// 게시글 작성자 프로필 (R15). 익명 글이면 학과(와 이후 추가될 기술 스택)만 공개한다
router.get('/:id/author', async (req, res) => {
  const post = await findPost(req.params.id);
  if (!post) return res.status(404).json({ message: '게시글을 찾을 수 없습니다.' });

  if (post.is_anonymous) {
    return res.json({ anonymous: true, name: '익명', department: post.author_department });
  }
  const [rows] = await pool.query('SELECT user_id, name, department, github_url FROM users WHERE user_id = ?', [
    post.user_id,
  ]);
  const user = rows[0];
  res.json({
    anonymous: false,
    userId: user.user_id,
    name: user.name,
    department: user.department,
    githubUrl: user.github_url,
  });
});

// 게시글 작성 (R5, R7)
router.post('/', requireUser, async (req, res) => {
  const { error, value } = validatePost(req.body ?? {});
  if (error) return res.status(400).json({ message: error });
  if (!(await categoryExists(value.categoryId))) return res.status(400).json({ message: '존재하지 않는 카테고리입니다.' });

  const [result] = await pool.query(
    'INSERT INTO posts (user_id, category_id, title, content, recruit_count, deadline, is_anonymous) VALUES (?, ?, ?, ?, ?, ?, ?)',
    [req.user.user_id, value.categoryId, value.title, value.content, value.recruitCount, value.deadline, value.isAnonymous]
  );
  res.status(201).json(toPost(await findPost(result.insertId), req.user));
});

// 게시글 수정 (R9: 작성자만)
router.put('/:id', requireUser, async (req, res) => {
  const post = await loadOwnPost(req, res);
  if (!post) return;
  const { error, value } = validatePost(req.body ?? {});
  if (error) return res.status(400).json({ message: error });
  if (!(await categoryExists(value.categoryId))) return res.status(400).json({ message: '존재하지 않는 카테고리입니다.' });

  await pool.query(
    'UPDATE posts SET category_id = ?, title = ?, content = ?, recruit_count = ?, deadline = ?, is_anonymous = ? WHERE post_id = ?',
    [value.categoryId, value.title, value.content, value.recruitCount, value.deadline, value.isAnonymous, post.post_id]
  );
  res.json(toPost(await findPost(post.post_id), req.user));
});

// 모집 상태 변경 (R8: 모집중 ↔ 모집완료, 작성자만)
router.patch('/:id/status', requireUser, async (req, res) => {
  const post = await loadOwnPost(req, res);
  if (!post) return;
  const status = req.body?.status;
  if (!STATUSES.includes(status)) return res.status(400).json({ message: '올바르지 않은 모집 상태입니다.' });

  await pool.query('UPDATE posts SET status = ? WHERE post_id = ?', [status, post.post_id]);
  res.json(toPost(await findPost(post.post_id), req.user));
});

// 게시글 삭제 (R9, R10: 기술 태그, 댓글, 지원 내역은 CASCADE로 함께 삭제)
router.delete('/:id', requireUser, async (req, res) => {
  const post = await loadOwnPost(req, res);
  if (!post) return;
  await pool.query('DELETE FROM posts WHERE post_id = ?', [post.post_id]);
  res.status(204).end();
});

export default router;
