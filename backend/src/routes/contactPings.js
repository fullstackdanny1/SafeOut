import express from 'express';
import { pool } from '../db/db.js';
import { asyncHandler } from '../middleware/asyncHandler.js';
import { authenticate } from '../middleware/authenticate.js';

const router = express.Router();

router.post('/', asyncHandler(async (req, res) => {
  await pool.query('INSERT INTO contact_pings DEFAULT VALUES');
  res.status(201).json({ status: 'logged' });
}));

// Protejat — doar numărul (anonim) de utilizări ale butonului „Call somebody"
router.get('/stats', authenticate, asyncHandler(async (req, res) => {
  const result = await pool.query(
    `SELECT count(*) FILTER (WHERE created_at >= now() - interval '24 hours')::int AS last_24h,
            count(*)::int AS total
     FROM contact_pings`
  );
  res.json(result.rows[0]);
}));

export default router;