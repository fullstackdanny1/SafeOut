import express from 'express';
import { pool } from '../db/db.js';
import { asyncHandler } from '../middleware/asyncHandler.js';

const router = express.Router();

router.post('/', asyncHandler(async (req, res) => {
  await pool.query('INSERT INTO contact_pings DEFAULT VALUES');
  res.status(201).json({ status: 'logged' });
}));

export default router;