import { Router } from 'express';
import { pool } from '../db.js';
import { requireUser } from '../middleware/auth.js';
import { getUserSkills } from '../skills.js';
import { getPublicProfile } from '../profiles.js';
import { findPost, today } from './posts.js';

const router = Router();
const MAX_MESSAGE = 300;
const DECISIONS = ['PENDING', 'ACCEPTED', 'REJECTED'];

// 지원하기 (R16 모집중만, R17 한 번만, R18 본인 글 불가, 마감일이 지난 글 불가)
router.post('/posts/:id/applications', requireUser, async (req, res) => {
  const post = await findPost(req.params.id);
  if (!post) return res.status(404).json({ message: '게시글을 찾을 수 없습니다.' });
  if (post.user_id === req.user.user_id) return res.status(400).json({ message: '본인이 작성한 글에는 지원할 수 없습니다.' });
  if (post.status !== 'OPEN') return res.status(400).json({ message: '모집이 완료된 글입니다.' });
  if (post.deadline && post.deadline < today()) return res.status(400).json({ message: '마감일이 지난 글입니다.' });

  const message = String(req.body?.message ?? '').trim() || null;
  if (message && message.length > MAX_MESSAGE) {
    return res.status(400).json({ message: `지원 메시지는 ${MAX_MESSAGE}자 이하로 입력해 주세요.` });
  }

  try {
    const [result] = await pool.query('INSERT INTO applications (post_id, user_id, message) VALUES (?, ?, ?)', [
      post.post_id,
      req.user.user_id,
      message,
    ]);
    res.status(201).json({ applicationId: result.insertId, status: 'PENDING', message });
  } catch (err) {
    // UNIQUE (post_id, user_id) 위반 → 이미 지원함 (거절된 경우 포함, 재지원 불가)
    if (err.code === 'ER_DUP_ENTRY') return res.status(409).json({ message: '이미 지원한 글입니다.' });
    throw err;
  }
});

// 지원자 목록 (R20: 글 작성자만). 지원자의 이름, 학과, GitHub, 보유 기술 스택 전체를 함께 보여준다
router.get('/posts/:id/applications', requireUser, async (req, res) => {
  const post = await findPost(req.params.id);
  if (!post) return res.status(404).json({ message: '게시글을 찾을 수 없습니다.' });
  if (post.user_id !== req.user.user_id) return res.status(403).json({ message: '작성자만 지원자 목록을 볼 수 있습니다.' });

  const [rows] = await pool.query(
    `SELECT a.application_id, a.status, a.message, a.applied_at,
            u.user_id, u.name, u.department, u.github_url
     FROM applications a JOIN users u ON u.user_id = a.user_id
     WHERE a.post_id = ? ORDER BY a.applied_at, a.application_id`,
    [post.post_id]
  );
  const skills = await getUserSkills(rows.map((row) => row.user_id));
  res.json(
    rows.map((row) => ({
      applicationId: row.application_id,
      status: row.status,
      message: row.message,
      appliedAt: row.applied_at,
      applicant: {
        userId: row.user_id,
        name: row.name,
        department: row.department,
        githubUrl: row.github_url,
        skills: skills[row.user_id],
      },
    }))
  );
});

// 수락 / 거절 / 대기로 되돌리기 (R20: 글 작성자만). 모집 인원을 넘는 수락은 막는다
router.patch('/applications/:id', requireUser, async (req, res) => {
  const status = req.body?.status;
  if (!DECISIONS.includes(status)) return res.status(400).json({ message: '올바르지 않은 지원 상태입니다.' });

  const [rows] = await pool.query(
    `SELECT a.application_id, a.status, p.post_id, p.user_id AS post_owner, p.recruit_count, p.team_formed_at
     FROM applications a JOIN posts p ON p.post_id = a.post_id
     WHERE a.application_id = ?`,
    [req.params.id]
  );
  const app = rows[0];
  if (!app) return res.status(404).json({ message: '지원 내역을 찾을 수 없습니다.' });
  if (app.post_owner !== req.user.user_id) return res.status(403).json({ message: '작성자만 지원을 처리할 수 있습니다.' });
  if (app.team_formed_at) return res.status(400).json({ message: '팀이 구성된 뒤에는 지원 상태를 바꿀 수 없습니다.' });

  if (status === 'ACCEPTED' && app.status !== 'ACCEPTED') {
    const [[{ accepted }]] = await pool.query(
      "SELECT COUNT(*) AS accepted FROM applications WHERE post_id = ? AND status = 'ACCEPTED'",
      [app.post_id]
    );
    if (accepted >= app.recruit_count) {
      return res.status(400).json({ message: `모집 인원(${app.recruit_count}명)이 모두 찼습니다.` });
    }
  }

  await pool.query('UPDATE applications SET status = ? WHERE application_id = ?', [status, app.application_id]);
  res.json({ applicationId: app.application_id, status });
});

// 지원자 프로필 (글 작성자만, 수락 전에도 가능). 이메일은 팀 구성 후 팀 페이지에서만 공개한다
router.get('/applications/:id/applicant', requireUser, async (req, res) => {
  const [rows] = await pool.query(
    `SELECT a.application_id, a.user_id, p.post_id, p.user_id AS post_owner
     FROM applications a JOIN posts p ON p.post_id = a.post_id
     WHERE a.application_id = ?`,
    [req.params.id]
  );
  const app = rows[0];
  if (!app) return res.status(404).json({ message: '지원 내역을 찾을 수 없습니다.' });
  if (app.post_owner !== req.user.user_id) return res.status(403).json({ message: '작성자만 지원자 프로필을 볼 수 있습니다.' });
  res.json({ postId: app.post_id, ...(await getPublicProfile(app.user_id, { anonymous: false })) });
});

// 지원 취소 (R22: 지원자 본인, 대기 상태일 때만)
router.delete('/applications/:id', requireUser, async (req, res) => {
  const [rows] = await pool.query('SELECT application_id, user_id, status FROM applications WHERE application_id = ?', [
    req.params.id,
  ]);
  const app = rows[0];
  if (!app) return res.status(404).json({ message: '지원 내역을 찾을 수 없습니다.' });
  if (app.user_id !== req.user.user_id) return res.status(403).json({ message: '본인의 지원만 취소할 수 있습니다.' });
  if (app.status !== 'PENDING') return res.status(400).json({ message: '대기 중인 지원만 취소할 수 있습니다.' });

  await pool.query('DELETE FROM applications WHERE application_id = ?', [app.application_id]);
  res.status(204).end();
});

// 마이페이지: 내가 쓴 글 (지원 현황 집계 포함)
router.get('/me/posts', requireUser, async (req, res) => {
  const [rows] = await pool.query(
    `SELECT p.post_id, p.title, p.status, p.recruit_count, p.deadline, p.is_anonymous, p.team_formed_at, p.created_at,
            c.name AS category_name,
            COUNT(a.application_id) AS total,
            COALESCE(SUM(a.status = 'PENDING'), 0) AS pending,
            COALESCE(SUM(a.status = 'ACCEPTED'), 0) AS accepted
     FROM posts p
     JOIN categories c ON c.category_id = p.category_id
     LEFT JOIN applications a ON a.post_id = p.post_id
     WHERE p.user_id = ?
     GROUP BY p.post_id, c.name
     ORDER BY p.created_at DESC, p.post_id DESC`,
    [req.user.user_id]
  );
  res.json(
    rows.map((row) => ({
      postId: row.post_id,
      title: row.title,
      status: row.status,
      recruitCount: row.recruit_count,
      deadline: row.deadline,
      isAnonymous: Boolean(row.is_anonymous),
      teamFormed: Boolean(row.team_formed_at),
      createdAt: row.created_at,
      category: row.category_name,
      applications: { total: Number(row.total), pending: Number(row.pending), accepted: Number(row.accepted) },
    }))
  );
});

// 마이페이지: 내 지원 현황 (R21). 익명 글은 수락되어 팀이 구성된 경우에만 작성자 실명을 보여준다 (R26)
router.get('/me/applications', requireUser, async (req, res) => {
  const [rows] = await pool.query(
    `SELECT a.application_id, a.status, a.message, a.applied_at,
            p.post_id, p.title, p.status AS post_status, p.is_anonymous, p.team_formed_at,
            c.name AS category_name,
            u.name AS author_name, u.department AS author_department, u.github_url AS author_github
     FROM applications a
     JOIN posts p      ON p.post_id = a.post_id
     JOIN categories c ON c.category_id = p.category_id
     JOIN users u      ON u.user_id = p.user_id
     WHERE a.user_id = ?
     ORDER BY a.applied_at DESC, a.application_id DESC`,
    [req.user.user_id]
  );
  res.json(
    rows.map((row) => {
      const inTeam = row.status === 'ACCEPTED' && Boolean(row.team_formed_at);
      const showRealName = !row.is_anonymous || inTeam;
      return {
        applicationId: row.application_id,
        status: row.status,
        message: row.message,
        appliedAt: row.applied_at,
        teamFormed: Boolean(row.team_formed_at),
        post: { postId: row.post_id, title: row.title, status: row.post_status, category: row.category_name },
        author: showRealName
          ? {
              anonymous: false,
              revealed: Boolean(row.is_anonymous),
              name: row.author_name,
              department: row.author_department,
              githubUrl: inTeam ? row.author_github : undefined,
            }
          : { anonymous: true, name: '익명', department: row.author_department },
      };
    })
  );
});

export default router;
