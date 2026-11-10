import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import { pool } from './db.js';
import { authenticate } from './middleware/auth.js';
import meRouter from './routes/me.js';
import categoriesRouter from './routes/categories.js';
import postsRouter from './routes/posts.js';
import skillsRouter from './routes/skills.js';
import commentsRouter from './routes/comments.js';

const app = express();
app.use(cors({ origin: 'http://localhost:5173' }));
app.use(express.json());

// MySQL 접속 확인용
app.get('/api/health', async (req, res) => {
  try {
    const [rows] = await pool.query('SELECT DATABASE() AS db, NOW() AS now');
    res.json({ ok: true, ...rows[0] });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// 모든 API 요청에서 로그인 토큰 확인
app.use('/api', authenticate);
app.use('/api/me', meRouter);
app.use('/api/categories', categoriesRouter);
app.use('/api/posts', postsRouter);
app.use('/api/skills', skillsRouter);
app.use('/api', commentsRouter);

// 처리되지 않은 오류
app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).json({ message: '서버 오류가 발생했습니다.' });
});

const port = process.env.PORT || 3000;
app.listen(port, () => console.log(`Server running on http://localhost:${port}`));
