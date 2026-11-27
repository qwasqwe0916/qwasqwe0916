import { Router } from 'express';
import { randomInt } from 'node:crypto';
import { pool } from '../db.js';
import { requireUser } from '../middleware/auth.js';
import { canParticipate, getMembership, getTeamInRoom, isRoomDeadlinePassed } from '../rooms.js';

const router = Router();
// 헷갈리기 쉬운 글자(0, O, 1, I)를 뺀 참여 코드용 문자
const CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

function makeCode() {
  return Array.from({ length: 6 }, () => CODE_CHARS[randomInt(CODE_CHARS.length)]).join('');
}

// 겹치지 않는 참여 코드를 만든다 (UNIQUE 제약으로 최종 확인)
async function uniqueCode(conn) {
  for (let i = 0; i < 10; i += 1) {
    const code = makeCode();
    const [rows] = await conn.query('SELECT 1 FROM rooms WHERE join_code = ?', [code]);
    if (rows.length === 0) return code;
  }
  throw new Error('참여 코드를 만들지 못했습니다.');
}

// 방 설정 입력값 검사
function validateRoom(body) {
  const name = String(body.name ?? '').trim();
  const description = String(body.description ?? '').trim() || null;
  const toSize = (v) => (v === null || v === undefined || v === '' ? null : Number(v));
  const minTeamSize = toSize(body.minTeamSize);
  const maxTeamSize = toSize(body.maxTeamSize);
  const teamDeadline = body.teamDeadline ? String(body.teamDeadline) : null;

  if (!name) return { error: '방 이름을 입력해 주세요.' };
  if (name.length > 100) return { error: '방 이름은 100자 이하로 입력해 주세요.' };
  if (description && description.length > 1000) return { error: '설명은 1000자 이하로 입력해 주세요.' };
  for (const size of [minTeamSize, maxTeamSize]) {
    if (size !== null && (!Number.isInteger(size) || size < 2 || size > 20)) {
      return { error: '팀 인원은 2 ~ 20명 사이로 입력해 주세요. (작성자 포함)' };
    }
  }
  if (minTeamSize && maxTeamSize && maxTeamSize < minTeamSize) return { error: '최대 인원은 최소 인원보다 작을 수 없습니다.' };
  if (teamDeadline && (!/^\d{4}-\d{2}-\d{2}$/.test(teamDeadline) || Number.isNaN(Date.parse(teamDeadline)))) {
    return { error: '마감일 형식이 올바르지 않습니다.' };
  }
  return { value: { name, description, minTeamSize, maxTeamSize, teamDeadline } };
}

function toRoom(row, { withCode = false } = {}) {
  return {
    roomId: row.room_id,
    name: row.name,
    description: row.description,
    minTeamSize: row.min_team_size,
    maxTeamSize: row.max_team_size,
    teamDeadline: row.team_deadline,
    isDeadlinePassed: isRoomDeadlinePassed(row),
    createdAt: row.created_at,
    ...(withCode && { joinCode: row.join_code }),
  };
}

// 방 참여자만 통과. 관리자 전용이면 manager: true
async function loadRoom(req, res, { manager = false } = {}) {
  const membership = await getMembership(req.params.id, req.user.user_id);
  if (!membership) {
    res.status(403).json({ message: '방 참여자만 볼 수 있습니다.' });
    return null;
  }
  if (manager && membership.role !== 'MANAGER') {
    res.status(403).json({ message: '방 관리자만 할 수 있습니다.' });
    return null;
  }
  return membership;
}

// 방 만들기 (R30): 만든 사람이 관리자가 된다
router.post('/rooms', requireUser, async (req, res) => {
  const { error, value } = validateRoom(req.body ?? {});
  if (error) return res.status(400).json({ message: error });

  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const code = await uniqueCode(conn);
    const [result] = await conn.query(
      `INSERT INTO rooms (name, description, join_code, min_team_size, max_team_size, team_deadline, created_by)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [value.name, value.description, code, value.minTeamSize, value.maxTeamSize, value.teamDeadline, req.user.user_id]
    );
    await conn.query("INSERT INTO room_members (room_id, user_id, role) VALUES (?, ?, 'MANAGER')", [
      result.insertId,
      req.user.user_id,
    ]);
    await conn.commit();
    res.status(201).json({ roomId: result.insertId, joinCode: code });
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }
});

// 내가 참여 중인 방 목록
router.get('/rooms', requireUser, async (req, res) => {
  const [rows] = await pool.query(
    `SELECT r.*, m.role,
            (SELECT COUNT(*) FROM room_members x WHERE x.room_id = r.room_id) AS member_count,
            (SELECT COUNT(*) FROM posts p WHERE p.room_id = r.room_id) AS post_count
     FROM room_members m JOIN rooms r ON r.room_id = m.room_id
     WHERE m.user_id = ?
     ORDER BY m.joined_at DESC`,
    [req.user.user_id]
  );
  res.json(
    rows.map((row) => ({
      ...toRoom(row),
      role: row.role,
      memberCount: Number(row.member_count),
      postCount: Number(row.post_count),
    }))
  );
});

// 참여 코드로 방 들어가기 (이미 참여 중이면 그대로 성공)
router.post('/rooms/join', requireUser, async (req, res) => {
  const code = String(req.body?.code ?? '').trim().toUpperCase();
  if (!/^[A-Z0-9]{6}$/.test(code)) return res.status(400).json({ message: '참여 코드는 6자리입니다.' });
  const [rows] = await pool.query('SELECT room_id FROM rooms WHERE join_code = ?', [code]);
  if (!rows[0]) return res.status(404).json({ message: '해당 참여 코드의 방이 없습니다.' });

  await pool.query("INSERT IGNORE INTO room_members (room_id, user_id, role) VALUES (?, ?, 'MEMBER')", [
    rows[0].room_id,
    req.user.user_id,
  ]);
  res.json({ roomId: rows[0].room_id });
});

// 방 정보 (참여자만). 관리자에게는 참여 코드도 보낸다
router.get('/rooms/:id', requireUser, async (req, res) => {
  const membership = await loadRoom(req, res);
  if (!membership) return;
  const [[{ count }]] = await pool.query('SELECT COUNT(*) AS count FROM room_members WHERE room_id = ?', [
    membership.room_id,
  ]);
  const [[creator]] = await pool.query('SELECT name FROM users WHERE user_id = ?', [membership.created_by]);
  res.json({
    ...toRoom(membership, { withCode: membership.role === 'MANAGER' }),
    role: membership.role,
    managerName: creator?.name ?? null,
    memberCount: Number(count),
    canParticipate: canParticipate(membership),
    myTeam: await getTeamInRoom(membership.room_id, req.user.user_id),
  });
});

// 방 설정 수정 (관리자)
router.put('/rooms/:id', requireUser, async (req, res) => {
  const membership = await loadRoom(req, res, { manager: true });
  if (!membership) return;
  const { error, value } = validateRoom(req.body ?? {});
  if (error) return res.status(400).json({ message: error });
  await pool.query(
    `UPDATE rooms SET name = ?, description = ?, min_team_size = ?, max_team_size = ?, team_deadline = ?
     WHERE room_id = ?`,
    [value.name, value.description, value.minTeamSize, value.maxTeamSize, value.teamDeadline, membership.room_id]
  );
  res.json({ ok: true });
});

// 참여 코드 재발급 (관리자). 이미 들어온 사람은 그대로
router.post('/rooms/:id/code', requireUser, async (req, res) => {
  const membership = await loadRoom(req, res, { manager: true });
  if (!membership) return;
  const code = await uniqueCode(pool);
  await pool.query('UPDATE rooms SET join_code = ? WHERE room_id = ?', [code, membership.room_id]);
  res.json({ joinCode: code });
});

// 방 삭제 (관리자). 방 안의 글, 팀, 팀 게시판이 모두 함께 삭제된다 (CASCADE)
router.delete('/rooms/:id', requireUser, async (req, res) => {
  const membership = await loadRoom(req, res, { manager: true });
  if (!membership) return;
  await pool.query('DELETE FROM rooms WHERE room_id = ?', [membership.room_id]);
  res.status(204).end();
});

// 방 나가기 (R36). 관리자는 나갈 수 없고, 팀에 소속된 사람은 팀부터 나가야 한다
// 나가면 이 방에서의 지원(팀 구성 전)은 취소되고, 내가 쓴 모집글(팀 미구성)은 삭제된다. 댓글은 남는다
router.post('/rooms/:id/leave', requireUser, async (req, res) => {
  const membership = await loadRoom(req, res);
  if (!membership) return;
  if (membership.role === 'MANAGER') {
    return res.status(400).json({ message: '관리자는 방을 나갈 수 없습니다. 방을 없애려면 방을 삭제해 주세요.' });
  }
  const team = await getTeamInRoom(membership.room_id, req.user.user_id);
  if (team) {
    return res.status(409).json({
      code: 'IN_TEAM',
      team,
      message: team.isLeader
        ? '이 방에서 팀장으로 팀에 소속되어 있습니다. 팀을 해체(게시글 삭제)한 뒤 방을 나갈 수 있습니다.'
        : '이 방에서 팀에 소속되어 있습니다. 팀 페이지에서 먼저 팀을 나간 뒤 방을 나갈 수 있습니다.',
    });
  }

  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    await conn.query(
      `DELETE FROM applications WHERE user_id = ?
       AND post_id IN (SELECT post_id FROM posts WHERE room_id = ?)`,
      [req.user.user_id, membership.room_id]
    );
    await conn.query('DELETE FROM posts WHERE room_id = ? AND user_id = ? AND team_formed_at IS NULL', [
      membership.room_id,
      req.user.user_id,
    ]);
    await conn.query('DELETE FROM room_members WHERE room_id = ? AND user_id = ?', [membership.room_id, req.user.user_id]);
    await conn.commit();
    res.json({ left: true });
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }
});

// 팀 편성 현황 (관리자, R34): 팀별 팀원과 미편성 참여자
async function loadStatus(room) {
  const [teams] = await pool.query(
    `SELECT p.post_id, p.title, p.team_formed_at, u.user_id, u.name, u.department, u.email, 'LEADER' AS role
     FROM posts p JOIN users u ON u.user_id = p.user_id
     WHERE p.room_id = ? AND p.team_formed_at IS NOT NULL
     UNION ALL
     SELECT p.post_id, p.title, p.team_formed_at, u.user_id, u.name, u.department, u.email, 'MEMBER' AS role
     FROM posts p
     JOIN applications a ON a.post_id = p.post_id AND a.status = 'ACCEPTED'
     JOIN users u ON u.user_id = a.user_id
     WHERE p.room_id = ? AND p.team_formed_at IS NOT NULL
     ORDER BY team_formed_at, post_id, role, name`,
    [room.room_id, room.room_id]
  );
  // 미편성: 방 참여자(관리자 제외) 중 어떤 팀에도 없는 사람
  const [unassigned] = await pool.query(
    `SELECT u.user_id, u.name, u.department, u.email
     FROM room_members m JOIN users u ON u.user_id = m.user_id
     WHERE m.room_id = ?
       AND m.role = 'MEMBER'
       AND NOT EXISTS (
         SELECT 1 FROM posts p
         WHERE p.room_id = m.room_id AND p.team_formed_at IS NOT NULL
           AND (p.user_id = m.user_id
                OR EXISTS (SELECT 1 FROM applications a
                           WHERE a.post_id = p.post_id AND a.user_id = m.user_id AND a.status = 'ACCEPTED')))
     ORDER BY u.name`,
    [room.room_id]
  );

  const grouped = [];
  for (const row of teams) {
    let team = grouped.find((t) => t.postId === row.post_id);
    if (!team) {
      team = { postId: row.post_id, title: row.title, formedAt: row.team_formed_at, members: [] };
      grouped.push(team);
    }
    team.members.push({ userId: row.user_id, name: row.name, department: row.department, email: row.email, role: row.role });
  }
  for (const team of grouped) {
    team.size = team.members.length;
    team.isShort = Boolean(room.min_team_size) && team.size < room.min_team_size;
  }
  return {
    teams: grouped,
    unassigned: unassigned.map((u) => ({ userId: u.user_id, name: u.name, department: u.department, email: u.email })),
  };
}

router.get('/rooms/:id/status', requireUser, async (req, res) => {
  const membership = await loadRoom(req, res, { manager: true });
  if (!membership) return;
  const status = await loadStatus(membership);
  const [[{ pool: poolSize }]] = await pool.query(
    "SELECT COUNT(*) AS pool FROM room_members WHERE room_id = ? AND role = 'MEMBER'",
    [membership.room_id]
  );
  res.json({ ...status, totalParticipants: Number(poolSize), minTeamSize: membership.min_team_size });
});

// 조 편성 결과 CSV (관리자). 엑셀에서 한글이 깨지지 않도록 UTF-8 BOM을 붙인다
router.get('/rooms/:id/export', requireUser, async (req, res) => {
  const membership = await loadRoom(req, res, { manager: true });
  if (!membership) return;
  const { teams, unassigned } = await loadStatus(membership);
  const escape = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;
  const lines = [['팀 번호', '팀 이름(모집글)', '역할', '이름', '학과', '이메일'].map(escape).join(',')];
  teams.forEach((team, index) => {
    for (const m of team.members) {
      lines.push([index + 1, team.title, m.role === 'LEADER' ? '작성자' : '팀원', m.name, m.department, m.email].map(escape).join(','));
    }
  });
  for (const u of unassigned) lines.push(['미편성', '', '', u.name, u.department, u.email].map(escape).join(','));

  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="room-${membership.room_id}-teams.csv"`);
  res.send('﻿' + lines.join('\r\n'));
});

export default router;
