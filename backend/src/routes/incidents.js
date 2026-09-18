import express from 'express';
import { pool } from '../db/db.js';

const router = express.Router();

router.get('/', async (req, res) => {
  const result = await pool.query('SELECT * FROM incidents ORDER BY created_at DESC');
  res.json(result.rows);
});

export default router;
