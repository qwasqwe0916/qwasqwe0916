import { Router } from 'express';
import { pool } from '../db.js';
import { requireUser } from '../middleware/auth.js';
import { getPublicProfile } from '../profiles.js';
import { findPost } from './posts.js';

const router = Router();
const MAX_LENGTH = 1000;

// 댓글을 익명으로 보여줘야 하는지 (R25)
// 익명 글의 작성자가 그 글에 단 댓글은 체크 여부와 관계없이 익명으로 처리한다
function isEffectivelyAnonymous(comment, post) {
  const byPostAuthor = comment.user_id === post.user_id;
  return Boolean(comment.is_anonymous) || (byPostAuthor && Boolean(post.is_anonymous));
}

// 댓글 목록을 화면용으로 만든다.
// 익명 댓글은 글 작성자면 "익명(작성자)", 그 외에는 처음 익명 댓글을 단 순서대로 "익명1", "익명2"…
// 같은 사람은 같은 번호를 받으며, 익명 댓글에는 이름·ID를 넣지 않는다.
function toComments(rows, post, viewer) {
  const anonymousNumbers = new Map();
  return rows.map((row) => {
    const byPostAuthor = row.user_id === post.user_id;
    const anonymous = isEffectivelyAnonymous(row, post);
    let author;
    if (anonymous) {
      let name = '익명(작성자)';
      if (!byPostAuthor) {
        if (!anonymousNumbers.has(row.user_id)) anonymousNumbers.set(row.user_id, anonymousNumbers.size + 1);
        name = `익명${anonymousNumbers.get(row.user_id)}`;
      }
      author = { anonymous: true, name, department: row.department };
    } else {
      author = { anonymous: false, userId: row.user_id, name: row.name, department: row.department };
    }
    return {
      commentId: row.comment_id,
      content: row.content,
      createdAt: row.created_at,
      isMine: Boolean(viewer) && viewer.user_id === row.user_id,
      isPostAuthor: byPostAuthor,
      author,
    };
  });
}

async function loadComments(post) {
  const [rows] = await pool.query(
    `SELECT c.comment_id, c.user_id, c.content, c.is_anonymous, c.created_at, u.name, u.department
     FROM comments c JOIN users u ON u.user_id = c.user_id
     WHERE c.post_id = ? ORDER BY c.created_at, c.comment_id`,
    [post.post_id]
  );
  return rows;
}

// 댓글 목록 (누구나)
router.get('/posts/:id/comments', async (req, res) => {
  const post = await findPost(req.params.id);
  if (!post) return res.status(404).json({ message: '게시글을 찾을 수 없습니다.' });
  res.json(toComments(await loadComments(post), post, req.user));
});

// 댓글 작성 (R13). 응답으로 갱신된 댓글 목록을 돌려준다 (익명 번호가 목록 기준으로 정해지므로)
router.post('/posts/:id/comments', requireUser, async (req, res) => {
  const post = await findPost(req.params.id);
  if (!post) return res.status(404).json({ message: '게시글을 찾을 수 없습니다.' });

  const content = String(req.body?.content ?? '').trim();
  if (!content) return res.status(400).json({ message: '댓글 내용을 입력해 주세요.' });
  if (content.length > MAX_LENGTH) return res.status(400).json({ message: `댓글은 ${MAX_LENGTH}자 이하로 입력해 주세요.` });

  const forced = post.is_anonymous && post.user_id === req.user.user_id;
  const isAnonymous = forced || req.body?.isAnonymous === true;
  await pool.query('INSERT INTO comments (post_id, user_id, content, is_anonymous) VALUES (?, ?, ?, ?)', [
    post.post_id,
    req.user.user_id,
    content,
    isAnonymous,
  ]);
  res.status(201).json(toComments(await loadComments(post), post, req.user));
});

// 댓글 삭제 (R14: 본인 댓글만)
router.delete('/comments/:id', requireUser, async (req, res) => {
  const [rows] = await pool.query('SELECT comment_id, user_id FROM comments WHERE comment_id = ?', [req.params.id]);
  const comment = rows[0];
  if (!comment) return res.status(404).json({ message: '댓글을 찾을 수 없습니다.' });
  if (comment.user_id !== req.user.user_id) return res.status(403).json({ message: '본인이 작성한 댓글만 삭제할 수 있습니다.' });

  await pool.query('DELETE FROM comments WHERE comment_id = ?', [comment.comment_id]);
  res.status(204).end();
});

// 댓글 작성자 프로필 (R15). 익명 댓글이면 학과와 기술 스택만 공개한다
router.get('/comments/:id/author', async (req, res) => {
  const [rows] = await pool.query('SELECT comment_id, post_id, user_id, is_anonymous FROM comments WHERE comment_id = ?', [
    req.params.id,
  ]);
  const comment = rows[0];
  if (!comment) return res.status(404).json({ message: '댓글을 찾을 수 없습니다.' });

  const post = await findPost(comment.post_id);
  const shown = toComments(await loadComments(post), post, null).find((c) => c.commentId === comment.comment_id);
  const profile = await getPublicProfile(comment.user_id, {
    anonymous: shown.author.anonymous,
    label: shown.author.name,
  });
  res.json({ postId: post.post_id, ...profile });
});

export default router;
