import express from 'express';
import { pool } from '../db/db.js';
import { authenticate } from '../middleware/authenticate.js';
import { requireRole } from '../middleware/requireRole.js';
import { asyncHandler } from '../middleware/asyncHandler.js';
import { AppError } from '../utils/AppError.js';

const router = express.Router();

router.get('/', authenticate, requireRole('super_admin'), asyncHandler(async (req, res) => {
  const result = await pool.query('SELECT * FROM venues ORDER BY created_at DESC');
  res.json(result.rows);
}));

router.post('/', authenticate, requireRole('super_admin'), asyncHandler(async (req, res) => {
  const { name, type, city, latitude, longitude } = req.body;
  if (!name || !city) {
    throw new AppError(400, 'Date lipsă', 'name și city sunt obligatorii');
  }
  const result = await pool.query(
    `INSERT INTO venues (name, type, city, latitude, longitude) VALUES ($1,$2,$3,$4,$5) RETURNING *`,
    [name, type ?? null, city, latitude ?? null, longitude ?? null]
  );
  res.status(201).json(result.rows[0]);
}));

router.patch('/:id', authenticate, requireRole('super_admin'), asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { name, type, city, latitude, longitude, active } = req.body;

  const result = await pool.query(
    `UPDATE venues SET
       name = COALESCE($1, name), type = COALESCE($2, type), city = COALESCE($3, city),
       latitude = COALESCE($4, latitude), longitude = COALESCE($5, longitude),
       active = COALESCE($6, active)
     WHERE id = $7 RETURNING *`,
    [name ?? null, type ?? null, city ?? null, latitude ?? null, longitude ?? null, active ?? null, id]
  );

  if (result.rowCount === 0) throw new AppError(404, 'Venue inexistent', 'Nu există acest venue');
  res.json(result.rows[0]);
}));

router.delete('/:id', authenticate, requireRole('super_admin'), asyncHandler(async (req, res) => {
  const { id } = req.params;
  const result = await pool.query('DELETE FROM venues WHERE id = $1 RETURNING id', [id]);
  if (result.rowCount === 0) throw new AppError(404, 'Venue inexistent', 'Nu există acest venue');
  res.status(204).send();
}));

export default router;