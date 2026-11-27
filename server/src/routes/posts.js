import { Router } from 'express';
import { pool } from '../db.js';
import { requireUser } from '../middleware/auth.js';
import { getPostSkills, validateSkillIds } from '../skills.js';
import { getPublicProfile } from '../profiles.js';
import { today } from '../dates.js';
import { checkRoomParticipation, getMembership } from '../rooms.js';

const router = Router();
const STATUSES = ['OPEN', 'CLOSED'];

const SELECT_POST = `
  SELECT p.post_id, p.title, p.content, p.recruit_count, p.deadline, p.status, p.is_anonymous,
         p.contact_link, p.team_formed_at, p.created_at, p.updated_at,
         p.room_id, r.name AS room_name, r.max_team_size AS room_max_team_size,
         c.category_id, c.name AS category_name,
         u.user_id, u.name AS author_name, u.department AS author_department
  FROM posts p
  JOIN categories c ON c.category_id = p.category_id
  JOIN users u      ON u.user_id = p.user_id
  LEFT JOIN rooms r ON r.room_id = p.room_id`;

// 방 글은 그 방 참여자에게만 보인다 (R30)
export async function canViewPost(post, user) {
  if (!post.room_id) return true;
  return Boolean(await getMembership(post.room_id, user?.user_id));
}

// 게시글을 찾고 볼 권한까지 확인한다. 없으면 404, 방 참여자가 아니면 403
export async function loadVisiblePost(req, res, postId = req.params.id) {
  const post = await findPost(postId);
  if (!post) {
    res.status(404).json({ message: '게시글을 찾을 수 없습니다.' });
    return null;
  }
  if (!(await canViewPost(post, req.user))) {
    res.status(403).json({ message: '방 참여자만 볼 수 있는 글입니다.' });
    return null;
  }
  return post;
}

// 연락 링크는 카카오톡 오픈채팅과 디스코드 초대 링크만 허용한다 (R28)
// 주소를 분해해 도메인이 정확히 일치하는지 검사한다 (open.kakao.com.evil.site 같은 위장 주소 차단)
export function validateContactLink(input) {
  const value = String(input ?? '').trim();
  if (!value) return { value: null };
  let url;
  try {
    url = new URL(value);
  } catch {
    return { error: '연락 링크 형식이 올바르지 않습니다.' };
  }
  const host = url.hostname.toLowerCase();
  const path = url.pathname;
  const allowed =
    url.protocol === 'https:' &&
    !url.username &&
    !url.password &&
    !url.port &&
    ((host === 'open.kakao.com' && /^\/o\/[^/]+/.test(path)) ||
      (host === 'discord.gg' && /^\/[^/]+/.test(path)) ||
      ((host === 'discord.com' || host === 'www.discord.com') && /^\/invite\/[^/]+/.test(path)));
  if (!allowed || value.length > 255) {
    return { error: '연락 링크는 카카오톡 오픈채팅(https://open.kakao.com/o/...) 또는 디스코드 초대 링크(https://discord.gg/...)만 넣을 수 있습니다.' };
  }
  return { value };
}

// 이 회원이 이 글의 팀원인지: 팀이 구성되었고, 작성자이거나 수락된 지원자 (R26, R29)
export async function isTeamMember(post, user) {
  if (!user || !post.team_formed_at) return false;
  if (post.user_id === user.user_id) return true;
  const [rows] = await pool.query(
    "SELECT 1 FROM applications WHERE post_id = ? AND user_id = ? AND status = 'ACCEPTED'",
    [post.post_id, user.user_id]
  );
  return rows.length > 0;
}

// 익명 글은 작성자 이름과 ID를 응답에서 빼고 학과만 보낸다 (R24)
// revealed: 팀이 구성되면 팀원에게는 익명 글 작성자의 실명을 공개한다 (R26)
function toAuthor(row, revealed = false) {
  if (row.is_anonymous && !revealed) return { anonymous: true, name: '익명', department: row.author_department };
  return {
    anonymous: false,
    ...(row.is_anonymous && { revealed: true }),
    userId: row.user_id,
    name: row.author_name,
    department: row.author_department,
  };
}

// viewer: 요청한 회원(req.user). isMine으로 "내 글인지"를 알려준다
function toPost(row, viewer, skills, { withContent = true, revealed = false } = {}) {
  const isMine = Boolean(viewer) && viewer.user_id === row.user_id;
  return {
    postId: row.post_id,
    title: row.title,
    ...(withContent && { content: row.content }),
    recruitCount: row.recruit_count,
    deadline: row.deadline,
    isExpired: Boolean(row.deadline) && row.deadline < today(),
    status: row.status,
    isAnonymous: Boolean(row.is_anonymous),
    isMine,
    teamFormed: Boolean(row.team_formed_at),
    // 연락 링크는 공개 응답에 넣지 않는다. 작성자에게만(수정 화면용) 보내고, 팀원은 팀 페이지에서 본다
    ...(isMine && { contactLink: row.contact_link }),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    category: { categoryId: row.category_id, name: row.category_name },
    room: row.room_id ? { roomId: row.room_id, name: row.room_name, maxTeamSize: row.room_max_team_size } : null,
    author: toAuthor(row, revealed),
    skills,
  };
}

// 게시글 하나를 기술 태그, 지원 현황, 내 지원 정보와 함께 응답 형태로 만든다
async function loadPost(postId, viewer) {
  const row = await findPost(postId);
  const skills = await getPostSkills([row.post_id]);
  const [[counts]] = await pool.query(
    "SELECT COUNT(*) AS total, COALESCE(SUM(status = 'ACCEPTED'), 0) AS accepted FROM applications WHERE post_id = ?",
    [row.post_id]
  );
  let myApplication = null;
  if (viewer) {
    const [mine] = await pool.query(
      'SELECT application_id, status, message, applied_at FROM applications WHERE post_id = ? AND user_id = ?',
      [row.post_id, viewer.user_id]
    );
    if (mine[0]) {
      myApplication = {
        applicationId: mine[0].application_id,
        status: mine[0].status,
        message: mine[0].message,
        appliedAt: mine[0].applied_at,
      };
    }
  }
  return {
    ...toPost(row, viewer, skills[row.post_id], {
      revealed: Boolean(row.team_formed_at) && myApplication?.status === 'ACCEPTED',
    }),
    applicationCount: Number(counts.total),
    acceptedCount: Number(counts.accepted),
    myApplication,
  };
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
async function savePost({ postId, userId, roomId = null, value, skills }) {
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    let id = postId;
    if (id) {
      await conn.query(
        'UPDATE posts SET category_id = ?, title = ?, content = ?, recruit_count = ?, deadline = ?, is_anonymous = ?, contact_link = ? WHERE post_id = ?',
        [value.categoryId, value.title, value.content, value.recruitCount, value.deadline, value.isAnonymous, value.contactLink, id]
      );
      await conn.query('DELETE FROM post_skills WHERE post_id = ?', [id]);
    } else {
      const [result] = await conn.query(
        'INSERT INTO posts (user_id, room_id, category_id, title, content, recruit_count, deadline, is_anonymous, contact_link) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
        [userId, roomId, value.categoryId, value.title, value.content, value.recruitCount, value.deadline, value.isAnonymous, value.contactLink]
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
  const contactLink = validateContactLink(body.contactLink);
  if (contactLink.error) return { error: contactLink.error };
  return { value: { title, content, categoryId, recruitCount, deadline, isAnonymous, contactLink: contactLink.value } };
}

// 방 글 규칙: 익명 불가, 모집 인원은 (방 최대 인원 - 작성자 1명)까지 (R31)
function applyRoomRules(value, maxTeamSize) {
  if (value.isAnonymous) return '방 안에서는 익명으로 글을 쓸 수 없습니다.';
  if (maxTeamSize && value.recruitCount > maxTeamSize - 1) {
    return `이 방의 팀 최대 인원은 ${maxTeamSize}명(작성자 포함)이라 모집 인원은 ${maxTeamSize - 1}명까지 가능합니다.`;
  }
  return '';
}

// 방 글의 카테고리는 항상 "팀 프로젝트" (R31)
async function teamProjectCategoryId() {
  const [rows] = await pool.query("SELECT category_id FROM categories WHERE name = '팀 프로젝트'");
  return rows[0]?.category_id;
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
  // 방 게시판(?room=ID)은 참여자만, 전체 게시판에는 방 글을 보여주지 않는다
  if (req.query.room) {
    const roomId = Number(req.query.room);
    if (!Number.isInteger(roomId) || !(await getMembership(roomId, req.user?.user_id))) {
      return res.status(403).json({ message: '방 참여자만 볼 수 있습니다.' });
    }
    conditions.push('p.room_id = ?');
    params.push(roomId);
  } else {
    conditions.push('p.room_id IS NULL');
  }
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
  const where = `WHERE ${conditions.join(' AND ')}`;
  const [rows] = await pool.query(`${SELECT_POST} ${where} ORDER BY p.created_at DESC, p.post_id DESC`, params);
  const skills = await getPostSkills(rows.map((row) => row.post_id));
  res.json(rows.map((row) => toPost(row, req.user, skills[row.post_id], { withContent: false })));
});

// 게시글 상세 (R11)
router.get('/:id', async (req, res) => {
  const post = await loadVisiblePost(req, res);
  if (!post) return;
  res.json(await loadPost(post.post_id, req.user));
});

// 게시글 작성자 프로필 (R15). 익명 글이면 학과와 기술 스택만 공개한다
router.get('/:id/author', async (req, res) => {
  const post = await loadVisiblePost(req, res);
  if (!post) return;
  const revealed = await isTeamMember(post, req.user);
  const profile = await getPublicProfile(post.user_id, { anonymous: Boolean(post.is_anonymous) && !revealed });
  res.json({ postId: post.post_id, ...profile });
});

// 게시글 작성 (R5, R7)
router.post('/', requireUser, async (req, res) => {
  const isRoomPost = req.body?.roomId !== undefined && req.body?.roomId !== null && req.body?.roomId !== '';
  if (isRoomPost) req.body.categoryId = await teamProjectCategoryId();
  const { error, value } = validatePost(req.body ?? {});
  if (error) return res.status(400).json({ message: error });
  if (!(await categoryExists(value.categoryId))) return res.status(400).json({ message: '존재하지 않는 카테고리입니다.' });
  const skills = await validatePostSkills(req.body?.skills);
  if (skills.error) return res.status(400).json({ message: skills.error });

  // 방 글이면 참여자·관리자 편성 여부·마감일·이미 팀 소속인지 검사 (R30 ~ R33)
  let roomId = null;
  if (isRoomPost) {
    roomId = Number(req.body.roomId);
    const check = Number.isInteger(roomId) ? await checkRoomParticipation(roomId, req.user.user_id) : { status: 400, message: '방 정보가 올바르지 않습니다.' };
    if (!check.membership) return res.status(check.status).json({ message: check.message });
    const ruleError = applyRoomRules(value, check.membership.max_team_size);
    if (ruleError) return res.status(400).json({ message: ruleError });
  }

  const postId = await savePost({ userId: req.user.user_id, roomId, value, skills: skills.value });
  res.status(201).json(await loadPost(postId, req.user));
});

// 게시글 수정 (R9: 작성자만)
router.put('/:id', requireUser, async (req, res) => {
  const post = await loadOwnPost(req, res);
  if (!post) return;
  if (post.room_id && req.body) req.body.categoryId = await teamProjectCategoryId();
  const { error, value } = validatePost(req.body ?? {});
  if (error) return res.status(400).json({ message: error });
  if (!(await categoryExists(value.categoryId))) return res.status(400).json({ message: '존재하지 않는 카테고리입니다.' });
  const skills = await validatePostSkills(req.body?.skills);
  if (skills.error) return res.status(400).json({ message: skills.error });
  if (post.room_id) {
    const ruleError = applyRoomRules(value, post.room_max_team_size);
    if (ruleError) return res.status(400).json({ message: ruleError });
  }

  await savePost({ postId: post.post_id, value, skills: skills.value });
  res.json(await loadPost(post.post_id, req.user));
});

// 모집 상태 변경 (R8: 모집중 ↔ 모집완료, 작성자만)
router.patch('/:id/status', requireUser, async (req, res) => {
  const post = await loadOwnPost(req, res);
  if (!post) return;
  const status = req.body?.status;
  if (!STATUSES.includes(status)) return res.status(400).json({ message: '올바르지 않은 모집 상태입니다.' });
  if (post.team_formed_at && status === 'OPEN') {
    return res.status(400).json({ message: '팀이 구성된 글은 다시 모집할 수 없습니다.' });
  }

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
