import { Router } from 'express';
import { pool } from '../db.js';

const router = Router();

// 기술 스택 목록 (선택지, 필터)
router.get('/', async (req, res) => {
  const [rows] = await pool.query('SELECT skill_id, name FROM skills ORDER BY name');
  res.json(rows.map((row) => ({ skillId: row.skill_id, name: row.name })));
});

export default router;
