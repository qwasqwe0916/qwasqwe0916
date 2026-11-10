import { supabase } from '../supabase.js';
import { pool } from '../db.js';

// 요청 헤더의 로그인 토큰을 확인해 req.authUser(Supabase 사용자)와
// req.user(MySQL 프로필, 없으면 null)를 채운다. 토큰이 없으면 그냥 통과한다.
export async function authenticate(req, res, next) {
  req.authUser = null;
  req.user = null;

  const header = req.headers.authorization ?? '';
  if (!header.startsWith('Bearer ')) return next();

  const { data, error } = await supabase.auth.getUser(header.slice(7));
  if (error || !data?.user) {
    return res.status(401).json({ message: '로그인 정보가 유효하지 않습니다. 다시 로그인해 주세요.' });
  }

  req.authUser = { id: data.user.id, email: data.user.email };
  const [rows] = await pool.query('SELECT * FROM users WHERE auth_uid = ?', [data.user.id]);
  req.user = rows[0] ?? null;
  next();
}

// 로그인이 필요한 요청 (프로필이 없어도 됨: 프로필 생성용)
export function requireAuth(req, res, next) {
  if (!req.authUser) return res.status(401).json({ message: '로그인이 필요합니다.' });
  next();
}

// 로그인과 프로필 등록이 모두 필요한 요청
export function requireUser(req, res, next) {
  if (!req.authUser) return res.status(401).json({ message: '로그인이 필요합니다.' });
  if (!req.user) return res.status(403).json({ code: 'PROFILE_REQUIRED', message: '프로필을 먼저 등록해 주세요.' });
  next();
}
