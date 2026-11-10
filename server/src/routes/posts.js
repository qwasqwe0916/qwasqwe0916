import { Router } from 'express';
import { pool } from '../db.js';
import { requireUser } from '../middleware/auth.js';
import { getPostSkills, validateSkillIds } from '../skills.js';
import { getPublicProfile } from '../profiles.js';

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
function toPost(row, viewer, skills, { withContent = true } = {}) {
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
    skills,
  };
}

// 게시글 하나를 기술 태그와 함께 응답 형태로 만든다
async function loadPost(postId, viewer) {
  const row = await findPost(postId);
  const skills = await getPostSkills([row.post_id]);
  return toPost(row, viewer, skills[row.post_id]);
}

// 게시글 요구 기술 검사: [{ skillId, isRequired }] (R6)
async function validatePostSkills(input) {
  if (input === undefined) return { value: [] };
  if (!Array.isArray(input)) return { error: '기술 태그 형식이 올바르지 않습니다.' };
  const ids = await validateSkillIds(input.map((item) => item?.skillId));
  if (ids.error) return { error: ids.error };
  if (ids.value.length !== input.length) return { error: '같은 기술을 두 번 선택할 수 없습니다.' };
  return { value: input.map((item) => ({ skillId: Number(item.skillId), isRequired: item.isRequired !== false })) };
}

// 게시글 저장(작성·수정)과 기술 태그 교체를 한 트랜잭션으로 처리한다
async function savePost({ postId, userId, value, skills }) {
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    let id = postId;
    if (id) {
      await conn.query(
        'UPDATE posts SET category_id = ?, title = ?, content = ?, recruit_count = ?, deadline = ?, is_anonymous = ? WHERE post_id = ?',
        [value.categoryId, value.title, value.content, value.recruitCount, value.deadline, value.isAnonymous, id]
      );
      await conn.query('DELETE FROM post_skills WHERE post_id = ?', [id]);
    } else {
      const [result] = await conn.query(
        'INSERT INTO posts (user_id, category_id, title, content, recruit_count, deadline, is_anonymous) VALUES (?, ?, ?, ?, ?, ?, ?)',
        [userId, value.categoryId, value.title, value.content, value.recruitCount, value.deadline, value.isAnonymous]
      );
      id = result.insertId;
    }
    if (skills.length > 0) {
      await conn.query('INSERT INTO post_skills (post_id, skill_id, is_required) VALUES ?', [
        skills.map((skill) => [id, skill.skillId, skill.isRequired]),
      ]);
    }
    await conn.commit();
    return id;
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }
}

export async function findPost(postId) {
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
  // 기술 필터: 선택한 기술 중 하나라도 요구하는 글 (예: ?skills=3,10)
  const skillIds = String(req.query.skills ?? '')
    .split(',')
    .map(Number)
    .filter((id) => Number.isInteger(id) && id > 0);
  if (skillIds.length > 0) {
    conditions.push('EXISTS (SELECT 1 FROM post_skills ps WHERE ps.post_id = p.post_id AND ps.skill_id IN (?))');
    params.push(skillIds);
  }
  const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
  const [rows] = await pool.query(`${SELECT_POST} ${where} ORDER BY p.created_at DESC, p.post_id DESC`, params);
  const skills = await getPostSkills(rows.map((row) => row.post_id));
  res.json(rows.map((row) => toPost(row, req.user, skills[row.post_id], { withContent: false })));
});

// 게시글 상세 (R11)
router.get('/:id', async (req, res) => {
  const post = await findPost(req.params.id);
  if (!post) return res.status(404).json({ message: '게시글을 찾을 수 없습니다.' });
  res.json(await loadPost(post.post_id, req.user));
});

// 게시글 작성자 프로필 (R15). 익명 글이면 학과와 기술 스택만 공개한다
router.get('/:id/author', async (req, res) => {
  const post = await findPost(req.params.id);
  if (!post) return res.status(404).json({ message: '게시글을 찾을 수 없습니다.' });
  const profile = await getPublicProfile(post.user_id, { anonymous: Boolean(post.is_anonymous) });
  res.json({ postId: post.post_id, ...profile });
});

// 게시글 작성 (R5, R7)
router.post('/', requireUser, async (req, res) => {
  const { error, value } = validatePost(req.body ?? {});
  if (error) return res.status(400).json({ message: error });
  if (!(await categoryExists(value.categoryId))) return res.status(400).json({ message: '존재하지 않는 카테고리입니다.' });
  const skills = await validatePostSkills(req.body?.skills);
  if (skills.error) return res.status(400).json({ message: skills.error });

  const postId = await savePost({ userId: req.user.user_id, value, skills: skills.value });
  res.status(201).json(await loadPost(postId, req.user));
});

// 게시글 수정 (R9: 작성자만)
router.put('/:id', requireUser, async (req, res) => {
  const post = await loadOwnPost(req, res);
  if (!post) return;
  const { error, value } = validatePost(req.body ?? {});
  if (error) return res.status(400).json({ message: error });
  if (!(await categoryExists(value.categoryId))) return res.status(400).json({ message: '존재하지 않는 카테고리입니다.' });
  const skills = await validatePostSkills(req.body?.skills);
  if (skills.error) return res.status(400).json({ message: skills.error });

  await savePost({ postId: post.post_id, value, skills: skills.value });
  res.json(await loadPost(post.post_id, req.user));
});

// 모집 상태 변경 (R8: 모집중 ↔ 모집완료, 작성자만)
router.patch('/:id/status', requireUser, async (req, res) => {
  const post = await loadOwnPost(req, res);
  if (!post) return;
  const status = req.body?.status;
  if (!STATUSES.includes(status)) return res.status(400).json({ message: '올바르지 않은 모집 상태입니다.' });

  await pool.query('UPDATE posts SET status = ? WHERE post_id = ?', [status, post.post_id]);
  res.json(await loadPost(post.post_id, req.user));
});

// 게시글 삭제 (R9, R10: 기술 태그, 댓글, 지원 내역은 CASCADE로 함께 삭제)
router.delete('/:id', requireUser, async (req, res) => {
  const post = await loadOwnPost(req, res);
  if (!post) return;
  await pool.query('DELETE FROM posts WHERE post_id = ?', [post.post_id]);
  res.status(204).end();
});

export default router;
