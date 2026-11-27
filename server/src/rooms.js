import { pool } from './db.js';
import { today } from './dates.js';

// 이 회원의 방 참여 정보 (없으면 null): { room_id, role, ...rooms 컬럼 }
export async function getMembership(roomId, userId, conn = pool) {
  if (!userId) return null;
  const [rows] = await conn.query(
    `SELECT r.*, m.role
     FROM room_members m JOIN rooms r ON r.room_id = m.room_id
     WHERE m.room_id = ? AND m.user_id = ?`,
    [roomId, userId]
  );
  return rows[0] ?? null;
}

// 이 방에서 이 회원이 소속된 팀 (팀 구성이 끝난 글 기준). 없으면 null
// 팀원 = 글 작성자 + 그 글에 수락된 지원자
export async function getTeamInRoom(roomId, userId, conn = pool) {
  const [rows] = await conn.query(
    `SELECT p.post_id, p.title, (p.user_id = ?) AS is_leader
     FROM posts p
     WHERE p.room_id = ? AND p.team_formed_at IS NOT NULL
       AND (p.user_id = ?
            OR EXISTS (SELECT 1 FROM applications a
                       WHERE a.post_id = p.post_id AND a.user_id = ? AND a.status = 'ACCEPTED'))
     LIMIT 1`,
    [userId, roomId, userId, userId]
  );
  if (!rows[0]) return null;
  return { postId: rows[0].post_id, title: rows[0].title, isLeader: Boolean(rows[0].is_leader) };
}

// 관리자가 팀 편성 대상에서 빠진 방이면 글쓰기·지원을 할 수 없다
export function canParticipate(membership) {
  return membership.role !== 'MANAGER' || Boolean(membership.manager_in_pool);
}

export function isRoomDeadlinePassed(room) {
  return Boolean(room.team_deadline) && room.team_deadline < today();
}

// 방 글에서 글쓰기·지원 전 공통 검사. 문제가 있으면 오류 메시지를 돌려준다
export async function checkRoomParticipation(roomId, userId) {
  const membership = await getMembership(roomId, userId);
  if (!membership) return { status: 403, message: '방 참여자만 할 수 있습니다.' };
  if (!canParticipate(membership)) return { status: 403, message: '이 방의 관리자는 팀 편성에 참여하지 않습니다.' };
  if (isRoomDeadlinePassed(membership)) return { status: 400, message: '팀 구성 마감일이 지난 방입니다.' };
  if (await getTeamInRoom(roomId, userId)) return { status: 400, message: '이미 이 방에서 팀에 소속되어 있습니다.' };
  return { membership };
}
