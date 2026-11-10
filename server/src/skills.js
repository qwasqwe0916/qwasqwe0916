import { pool } from './db.js';

const MAX_SKILLS = 30;

// 기술 ID 목록 검사: 정수 배열, 중복 제거, 실제 존재하는 기술인지 확인
export async function validateSkillIds(input) {
  if (input === undefined) return { value: undefined }; // 보내지 않으면 기술 스택은 그대로 둔다
  if (!Array.isArray(input)) return { error: '기술 스택 형식이 올바르지 않습니다.' };
  const ids = [...new Set(input.map(Number))];
  if (ids.some((id) => !Number.isInteger(id))) return { error: '기술 스택 형식이 올바르지 않습니다.' };
  if (ids.length > MAX_SKILLS) return { error: `기술 스택은 ${MAX_SKILLS}개까지 선택할 수 있습니다.` };
  if (ids.length > 0) {
    const [rows] = await pool.query('SELECT COUNT(*) AS cnt FROM skills WHERE skill_id IN (?)', [ids]);
    if (rows[0].cnt !== ids.length) return { error: '존재하지 않는 기술 스택이 포함되어 있습니다.' };
  }
  return { value: ids };
}

// 사용자들의 보유 기술: { userId: [{ skillId, name }] }
export async function getUserSkills(userIds) {
  const map = Object.fromEntries(userIds.map((id) => [id, []]));
  if (userIds.length === 0) return map;
  const [rows] = await pool.query(
    `SELECT us.user_id, s.skill_id, s.name
     FROM user_skills us JOIN skills s ON s.skill_id = us.skill_id
     WHERE us.user_id IN (?) ORDER BY s.name`,
    [userIds]
  );
  for (const row of rows) map[row.user_id].push({ skillId: row.skill_id, name: row.name });
  return map;
}

// 게시글들의 요구 기술: { postId: [{ skillId, name, isRequired }] } (필수 먼저)
export async function getPostSkills(postIds) {
  const map = Object.fromEntries(postIds.map((id) => [id, []]));
  if (postIds.length === 0) return map;
  const [rows] = await pool.query(
    `SELECT ps.post_id, s.skill_id, s.name, ps.is_required
     FROM post_skills ps JOIN skills s ON s.skill_id = ps.skill_id
     WHERE ps.post_id IN (?) ORDER BY ps.is_required DESC, s.name`,
    [postIds]
  );
  for (const row of rows) {
    map[row.post_id].push({ skillId: row.skill_id, name: row.name, isRequired: Boolean(row.is_required) });
  }
  return map;
}

// 사용자 보유 기술 교체 (트랜잭션 연결 conn 안에서 실행)
export async function replaceUserSkills(conn, userId, skillIds) {
  await conn.query('DELETE FROM user_skills WHERE user_id = ?', [userId]);
  if (skillIds.length > 0) {
    await conn.query('INSERT INTO user_skills (user_id, skill_id) VALUES ?', [skillIds.map((id) => [userId, id])]);
  }
}
