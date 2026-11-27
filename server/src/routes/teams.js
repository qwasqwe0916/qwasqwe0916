import { Router } from 'express';
import { pool } from '../db.js';
import { requireUser } from '../middleware/auth.js';
import { getUserSkills } from '../skills.js';
import { findPost, isTeamMember } from './posts.js';
import { getTeamInRoom } from '../rooms.js';

const router = Router();
const MAX_MESSAGE = 1000;

// 팀원만 통과시킨다. 팀이 없거나 팀원이 아니면 403/404
async function loadTeamPost(req, res) {
  const post = await findPost(req.params.id);
  if (!post) {
    res.status(404).json({ message: '게시글을 찾을 수 없습니다.' });
    return null;
  }
  if (!post.team_formed_at) {
    res.status(404).json({ message: '아직 팀이 구성되지 않았습니다.' });
    return null;
  }
  if (!(await isTeamMember(post, req.user))) {
    res.status(403).json({ message: '팀원만 볼 수 있습니다.' });
    return null;
  }
  return post;
}

// 팀 구성하기 (R27: 작성자만, 수락 1명 이상)
// 글은 모집완료로 바뀌고, 대기 중인 지원은 자동 거절되며, 이후 지원 상태는 바꿀 수 없다
// 방 글이면 팀 인원 범위와 "한 방 한 팀" 규칙도 검사한다 (R33, R34)
router.post('/posts/:id/team', requireUser, async (req, res) => {
  const post = await findPost(req.params.id);
  if (!post) return res.status(404).json({ message: '게시글을 찾을 수 없습니다.' });
  if (post.user_id !== req.user.user_id) return res.status(403).json({ message: '작성자만 팀을 구성할 수 있습니다.' });
  if (post.team_formed_at) return res.status(409).json({ message: '이미 팀이 구성되었습니다.' });

  const conn = await pool.getConnection();
  const fail = async (status, message) => {
    await conn.rollback();
    res.status(status).json({ message });
  };
  try {
    await conn.beginTransaction();
    // 같은 방에서 팀 구성이 동시에 일어나지 않도록 방(또는 게시글) 행을 잠근다
    let room = null;
    if (post.room_id) {
      [[room]] = await conn.query('SELECT * FROM rooms WHERE room_id = ? FOR UPDATE', [post.room_id]);
    }
    const [[locked]] = await conn.query('SELECT team_formed_at FROM posts WHERE post_id = ? FOR UPDATE', [post.post_id]);
    if (locked.team_formed_at) return await fail(409, '이미 팀이 구성되었습니다.');

    const [accepted] = await conn.query(
      `SELECT a.user_id, u.name FROM applications a JOIN users u ON u.user_id = a.user_id
       WHERE a.post_id = ? AND a.status = 'ACCEPTED'`,
      [post.post_id]
    );
    if (accepted.length < 1) return await fail(400, '수락한 지원자가 1명 이상 있어야 팀을 구성할 수 있습니다.');

    const memberIds = [post.user_id, ...accepted.map((row) => row.user_id)];
    if (room) {
      const size = memberIds.length;
      if (room.min_team_size && size < room.min_team_size) {
        return await fail(400, `이 방의 팀 인원은 최소 ${room.min_team_size}명(작성자 포함)입니다. 지금은 ${size}명입니다.`);
      }
      if (room.max_team_size && size > room.max_team_size) {
        return await fail(400, `이 방의 팀 인원은 최대 ${room.max_team_size}명(작성자 포함)입니다. 지금은 ${size}명입니다.`);
      }
      const names = { [post.user_id]: post.author_name, ...Object.fromEntries(accepted.map((r) => [r.user_id, r.name])) };
      const conflicts = [];
      for (const id of memberIds) {
        if (await getTeamInRoom(room.room_id, id, conn)) conflicts.push(names[id]);
      }
      if (conflicts.length > 0) {
        return await fail(409, `${conflicts.join(', ')}님은 이미 이 방에서 다른 팀에 소속되어 있습니다. 수락을 취소해 주세요.`);
      }
    }

    await conn.query("UPDATE posts SET team_formed_at = NOW(), status = 'CLOSED' WHERE post_id = ?", [post.post_id]);
    const [rejected] = await conn.query(
      "UPDATE applications SET status = 'REJECTED' WHERE post_id = ? AND status = 'PENDING'",
      [post.post_id]
    );

    // 방 글: 새 팀원들이 같은 방에서 하던 다른 활동을 정리한다 (R33)
    // 다른 글에 넣은 대기 지원은 취소, 수락만 된 지원은 거절, 본인이 쓴 다른 모집글은 모집완료
    if (room) {
      await conn.query(
        `DELETE FROM applications WHERE user_id IN (?) AND status = 'PENDING'
         AND post_id IN (SELECT post_id FROM posts WHERE room_id = ? AND post_id <> ?)`,
        [memberIds, room.room_id, post.post_id]
      );
      await conn.query(
        `UPDATE applications SET status = 'REJECTED' WHERE user_id IN (?) AND status = 'ACCEPTED'
         AND post_id IN (SELECT post_id FROM posts WHERE room_id = ? AND post_id <> ? AND team_formed_at IS NULL)`,
        [memberIds, room.room_id, post.post_id]
      );
      await conn.query(
        `UPDATE posts SET status = 'CLOSED'
         WHERE room_id = ? AND user_id IN (?) AND post_id <> ? AND team_formed_at IS NULL`,
        [room.room_id, memberIds, post.post_id]
      );
    }
    await conn.commit();
    res.status(201).json({ postId: post.post_id, members: memberIds.length, autoRejected: rejected.affectedRows });
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }
});

// 팀 나가기 (R35: 수락된 팀원만, 작성자는 팀 해체 = 글 삭제)
// 지원 기록을 지워 팀에서 빠지며, 마지막 팀원이 나가면 팀 구성이 취소된다
router.post('/posts/:id/team/leave', requireUser, async (req, res) => {
  const post = await findPost(req.params.id);
  if (!post) return res.status(404).json({ message: '게시글을 찾을 수 없습니다.' });
  if (!post.team_formed_at) return res.status(400).json({ message: '아직 팀이 구성되지 않았습니다.' });
  if (post.user_id === req.user.user_id) {
    return res.status(400).json({ message: '작성자는 팀을 나갈 수 없습니다. 팀을 해체하려면 게시글을 삭제해 주세요.' });
  }

  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    await conn.query('SELECT post_id FROM posts WHERE post_id = ? FOR UPDATE', [post.post_id]);
    const [deleted] = await conn.query(
      "DELETE FROM applications WHERE post_id = ? AND user_id = ? AND status = 'ACCEPTED'",
      [post.post_id, req.user.user_id]
    );
    if (deleted.affectedRows === 0) {
      await conn.rollback();
      return res.status(403).json({ message: '이 팀의 팀원이 아닙니다.' });
    }
    const [[{ remaining }]] = await conn.query(
      "SELECT COUNT(*) AS remaining FROM applications WHERE post_id = ? AND status = 'ACCEPTED'",
      [post.post_id]
    );
    const dissolved = Number(remaining) === 0;
    if (dissolved) await conn.query('UPDATE posts SET team_formed_at = NULL WHERE post_id = ?', [post.post_id]);
    await conn.commit();
    res.json({ left: true, dissolved });
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }
});

// 팀 페이지 (R29): 팀원 목록(이메일 포함), 연락 링크
router.get('/posts/:id/team', requireUser, async (req, res) => {
  const post = await loadTeamPost(req, res);
  if (!post) return;

  const [rows] = await pool.query(
    `SELECT u.user_id, u.name, u.email, u.department, u.github_url, 'LEADER' AS role, NULL AS joined_at
     FROM users u WHERE u.user_id = ?
     UNION ALL
     SELECT u.user_id, u.name, u.email, u.department, u.github_url, 'MEMBER' AS role, a.applied_at AS joined_at
     FROM applications a JOIN users u ON u.user_id = a.user_id
     WHERE a.post_id = ? AND a.status = 'ACCEPTED'
     ORDER BY role, joined_at`,
    [post.user_id, post.post_id]
  );
  const skills = await getUserSkills(rows.map((row) => row.user_id));
  res.json({
    postId: post.post_id,
    title: post.title,
    category: post.category_name,
    formedAt: post.team_formed_at,
    contactLink: post.contact_link,
    room: post.room_id ? { roomId: post.room_id, name: post.room_name } : null,
    isLeader: post.user_id === req.user.user_id,
    members: rows.map((row) => ({
      userId: row.user_id,
      name: row.name,
      email: row.email,
      department: row.department,
      githubUrl: row.github_url,
      role: row.role,
      isMe: row.user_id === req.user.user_id,
      skills: skills[row.user_id],
    })),
  });
});

async function loadMessages(postId, viewer) {
  const [rows] = await pool.query(
    `SELECT m.message_id, m.user_id, m.content, m.created_at, u.name
     FROM team_messages m JOIN users u ON u.user_id = m.user_id
     WHERE m.post_id = ? ORDER BY m.created_at, m.message_id`,
    [postId]
  );
  return rows.map((row) => ({
    messageId: row.message_id,
    content: row.content,
    createdAt: row.created_at,
    author: { userId: row.user_id, name: row.name },
    isMine: row.user_id === viewer.user_id,
  }));
}

// 팀 게시판 (R29): 팀원만 읽고 쓰기
router.get('/posts/:id/team/messages', requireUser, async (req, res) => {
  const post = await loadTeamPost(req, res);
  if (!post) return;
  res.json(await loadMessages(post.post_id, req.user));
});

router.post('/posts/:id/team/messages', requireUser, async (req, res) => {
  const post = await loadTeamPost(req, res);
  if (!post) return;
  const content = String(req.body?.content ?? '').trim();
  if (!content) return res.status(400).json({ message: '내용을 입력해 주세요.' });
  if (content.length > MAX_MESSAGE) return res.status(400).json({ message: `${MAX_MESSAGE}자 이하로 입력해 주세요.` });

  await pool.query('INSERT INTO team_messages (post_id, user_id, content) VALUES (?, ?, ?)', [
    post.post_id,
    req.user.user_id,
    content,
  ]);
  res.status(201).json(await loadMessages(post.post_id, req.user));
});

// 팀 게시판 글 삭제 (본인 글만)
router.delete('/team-messages/:id', requireUser, async (req, res) => {
  const [rows] = await pool.query('SELECT message_id, user_id FROM team_messages WHERE message_id = ?', [req.params.id]);
  const message = rows[0];
  if (!message) return res.status(404).json({ message: '글을 찾을 수 없습니다.' });
  if (message.user_id !== req.user.user_id) return res.status(403).json({ message: '본인이 쓴 글만 삭제할 수 있습니다.' });
  await pool.query('DELETE FROM team_messages WHERE message_id = ?', [message.message_id]);
  res.status(204).end();
});

export default router;
