// src/routes/health.js
import express from 'express';
import { pool } from '../db/db.js';
import { asyncHandler } from '../middleware/asyncHandler.js';

const router = express.Router();

router.get('/', asyncHandler(async (req, res) => {
  const result = await pool.query('SELECT NOW()');
  res.json({
    status: 'ok',
    db: 'connected',
    timestamp: result.rows[0].now
  });
}));

export default router;