import { Router } from 'express';
import { pool } from '../db.js';

const router = Router();

// 카테고리 목록 (글쓰기 선택지, 목록 탭)
router.get('/', async (req, res) => {
  const [rows] = await pool.query('SELECT category_id, name FROM categories ORDER BY category_id');
  res.json(rows.map((row) => ({ categoryId: row.category_id, name: row.name })));
});

export default router;
