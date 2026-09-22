import express from 'express';
import { pool } from '../db/db.js';
import { authenticate } from '../middleware/authenticate.js';
import { requireRole } from '../middleware/requireRole.js';
import { asyncHandler } from '../middleware/asyncHandler.js';
import { AppError } from '../utils/AppError.js';

const router = express.Router();

// Public — victima scanează codul, aplicația citește locația
router.get('/:code', asyncHandler(async (req, res) => {
  const { code } = req.params;

  const result = await pool.query(
    'UPDATE qrcodes SET scans = scans + 1 WHERE code = $1 AND active = true RETURNING *',
    [code]
  );

  if (result.rowCount === 0) {
    throw new AppError(404, 'Cod QR invalid', 'Codul nu există sau nu mai este activ');
  }

  res.json(result.rows[0]);
}));

// Protejat — doar super_admin poate crea coduri noi (poweradmin.html)
router.post('/', authenticate, requireRole('super_admin'), asyncHandler(async (req, res) => {
  const { code, venue_id, venue_name, placement, city, latitude, longitude } = req.body;

  if (!code || !city) {
    throw new AppError(400, 'Date lipsă', 'code și city sunt obligatorii');
  }

  const result = await pool.query(
    `INSERT INTO qrcodes (code, venue_id, venue_name, placement, city, latitude, longitude)
    VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *`,
    [code, venue_id ?? null, venue_name ?? null, placement ?? null, city, latitude ?? null, longitude ?? null]
  );

  res.status(201).json(result.rows[0]);
}));

router.get('/', authenticate, requireRole('super_admin'), asyncHandler(async (req, res) => {
  const result = await pool.query('SELECT * FROM qrcodes ORDER BY created_at DESC');
  res.json(result.rows);
}));

export default router;