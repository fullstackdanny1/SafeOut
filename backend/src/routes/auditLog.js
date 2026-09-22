import express from 'express';
import { pool } from '../db/db.js';
import { authenticate } from '../middleware/authenticate.js';
import { asyncHandler } from '../middleware/asyncHandler.js';

const router = express.Router();

router.get('/', authenticate, asyncHandler(async (req, res) => {
  const query = req.dispatcher.role === 'super_admin'
    ? 'SELECT * FROM audit_log ORDER BY created_at DESC LIMIT 100'
    : 'SELECT * FROM audit_log WHERE dispatcher_id = $1 ORDER BY created_at DESC LIMIT 100';
  const params = req.dispatcher.role === 'super_admin' ? [] : [req.dispatcher.id];

  const result = await pool.query(query, params);
  res.json(result.rows);
}));

export default router;