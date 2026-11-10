import { Router } from 'express';
import { pool } from '../db.js';
import { requireAuth, requireUser } from '../middleware/auth.js';

const ALLOWED_EMAIL_DOMAIN = '@seoultech.ac.kr';
const router = Router();

function toProfile(user) {
  return {
    userId: user.user_id,
    email: user.email,
    name: user.name,
    department: user.department,
    githubUrl: user.github_url,
    createdAt: user.created_at,
  };
}

// 입력값 검사. 문제가 있으면 오류 메시지를, 없으면 정리된 값을 돌려준다.
function validateProfile(body) {
  const name = String(body.name ?? '').trim();
  const department = String(body.department ?? '').trim() || null;
  const githubUrl = String(body.githubUrl ?? '').trim() || null;

  if (!name) return { error: '이름을 입력해 주세요.' };
  if (name.length > 50) return { error: '이름은 50자 이하로 입력해 주세요.' };
  if (department && department.length > 50) return { error: '학과는 50자 이하로 입력해 주세요.' };
  if (githubUrl && (!githubUrl.startsWith('https://github.com/') || githubUrl.length > 255)) {
    return { error: 'GitHub 주소는 https://github.com/ 으로 시작해야 합니다.' };
  }
  return { value: { name, department, githubUrl } };
}

// 내 정보 조회. 프로필이 없으면 404 (화면에서 프로필 설정으로 이동)
router.get('/', requireAuth, (req, res) => {
  if (!req.user) {
    return res.status(404).json({ code: 'PROFILE_REQUIRED', email: req.authUser.email });
  }
  res.json(toProfile(req.user));
});

// 첫 로그인 시 프로필 생성 (R1, R2)
router.post('/', requireAuth, async (req, res) => {
  const email = (req.authUser.email ?? '').toLowerCase();
  if (!email.endsWith(ALLOWED_EMAIL_DOMAIN)) {
    return res.status(403).json({ message: `교내 이메일(${ALLOWED_EMAIL_DOMAIN})로만 가입할 수 있습니다.` });
  }
  if (req.user) return res.status(409).json({ message: '이미 프로필이 등록되어 있습니다.' });

  const { error, value } = validateProfile(req.body ?? {});
  if (error) return res.status(400).json({ message: error });

  const [result] = await pool.query(
    'INSERT INTO users (auth_uid, email, name, department, github_url) VALUES (?, ?, ?, ?, ?)',
    [req.authUser.id, email, value.name, value.department, value.githubUrl]
  );
  const [rows] = await pool.query('SELECT * FROM users WHERE user_id = ?', [result.insertId]);
  res.status(201).json(toProfile(rows[0]));
});

// 내 프로필 수정 (R4: 본인만 수정 가능 → 토큰의 사용자만 수정)
router.put('/', requireUser, async (req, res) => {
  const { error, value } = validateProfile(req.body ?? {});
  if (error) return res.status(400).json({ message: error });

  await pool.query(
    'UPDATE users SET name = ?, department = ?, github_url = ? WHERE user_id = ?',
    [value.name, value.department, value.githubUrl, req.user.user_id]
  );
  const [rows] = await pool.query('SELECT * FROM users WHERE user_id = ?', [req.user.user_id]);
  res.json(toProfile(rows[0]));
});

export default router;
