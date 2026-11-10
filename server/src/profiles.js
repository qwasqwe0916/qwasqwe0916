import { pool } from './db.js';
import { getUserSkills } from './skills.js';

// 다른 사람에게 보여주는 프로필 (R15).
// 익명이면 이름·ID·GitHub를 빼고 학과와 기술 스택만 보낸다.
export async function getPublicProfile(userId, { anonymous, label = '익명' }) {
  const [rows] = await pool.query('SELECT user_id, name, department, github_url FROM users WHERE user_id = ?', [userId]);
  const user = rows[0];
  const skills = (await getUserSkills([userId]))[userId];
  if (anonymous) return { anonymous: true, name: label, department: user.department, skills };
  return {
    anonymous: false,
    userId: user.user_id,
    name: user.name,
    department: user.department,
    githubUrl: user.github_url,
    skills,
  };
}
