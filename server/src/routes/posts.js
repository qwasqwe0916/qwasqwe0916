import { Router } from 'express';
import { pool } from '../db.js';
import { requireUser } from '../middleware/auth.js';

const router = Router();
const STATUSES = ['OPEN', 'CLOSED'];

const SELECT_POST = `
  SELECT p.post_id, p.title, p.content, p.recruit_count, p.deadline, p.status,
         p.created_at, p.updated_at,
         c.category_id, c.name AS category_name,
         u.user_id, u.name AS author_name, u.department AS author_department
  FROM posts p
  JOIN categories c ON c.category_id = p.category_id
  JOIN users u      ON u.user_id = p.user_id`;

function toPost(row, { withContent = true } = {}) {
  return {
    postId: row.post_id,
    title: row.title,
    ...(withContent && { content: row.content }),
    recruitCount: row.recruit_count,
    deadline: row.deadline,
    status: row.status,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    category: { categoryId: row.category_id, name: row.category_name },
    author: { userId: row.user_id, name: row.author_name, department: row.author_department },
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
  return { value: { title, content, categoryId, recruitCount, deadline } };
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
  res.json(rows.map((row) => toPost(row, { withContent: false })));
});

// 게시글 상세 (R11)
router.get('/:id', async (req, res) => {
  const post = await findPost(req.params.id);
  if (!post) return res.status(404).json({ message: '게시글을 찾을 수 없습니다.' });
  res.json(toPost(post));
});

// 게시글 작성 (R5, R7)
router.post('/', requireUser, async (req, res) => {
  const { error, value } = validatePost(req.body ?? {});
  if (error) return res.status(400).json({ message: error });
  if (!(await categoryExists(value.categoryId))) return res.status(400).json({ message: '존재하지 않는 카테고리입니다.' });

  const [result] = await pool.query(
    'INSERT INTO posts (user_id, category_id, title, content, recruit_count, deadline) VALUES (?, ?, ?, ?, ?, ?)',
    [req.user.user_id, value.categoryId, value.title, value.content, value.recruitCount, value.deadline]
  );
  res.status(201).json(toPost(await findPost(result.insertId)));
});

// 게시글 수정 (R9: 작성자만)
router.put('/:id', requireUser, async (req, res) => {
  const post = await loadOwnPost(req, res);
  if (!post) return;
  const { error, value } = validatePost(req.body ?? {});
  if (error) return res.status(400).json({ message: error });
  if (!(await categoryExists(value.categoryId))) return res.status(400).json({ message: '존재하지 않는 카테고리입니다.' });

  await pool.query(
    'UPDATE posts SET category_id = ?, title = ?, content = ?, recruit_count = ?, deadline = ? WHERE post_id = ?',
    [value.categoryId, value.title, value.content, value.recruitCount, value.deadline, post.post_id]
  );
  res.json(toPost(await findPost(post.post_id)));
});

// 모집 상태 변경 (R8: 모집중 ↔ 모집완료, 작성자만)
router.patch('/:id/status', requireUser, async (req, res) => {
  const post = await loadOwnPost(req, res);
  if (!post) return;
  const status = req.body?.status;
  if (!STATUSES.includes(status)) return res.status(400).json({ message: '올바르지 않은 모집 상태입니다.' });

  await pool.query('UPDATE posts SET status = ? WHERE post_id = ?', [status, post.post_id]);
  res.json(toPost(await findPost(post.post_id)));
});

// 게시글 삭제 (R9, R10: 기술 태그, 댓글, 지원 내역은 CASCADE로 함께 삭제)
router.delete('/:id', requireUser, async (req, res) => {
  const post = await loadOwnPost(req, res);
  if (!post) return;
  await pool.query('DELETE FROM posts WHERE post_id = ?', [post.post_id]);
  res.status(204).end();
});

export default router;
