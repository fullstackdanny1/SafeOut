import express from 'express';
import bcrypt from 'bcrypt';
import { pool } from '../db/db.js';
import { authenticate } from '../middleware/authenticate.js';
import { asyncHandler } from '../middleware/asyncHandler.js';
import { AppError } from '../utils/AppError.js';
import { requireRole } from '../middleware/requireRole.js';

const router = express.Router();

router.get('/me', authenticate, asyncHandler(async (req, res) => {
  const result = await pool.query(
    'SELECT id, email, full_name, city, role, created_at FROM dispatchers WHERE id = $1',
    [req.dispatcher.id]
  );
  if (result.rowCount === 0) {
    throw new AppError(404, 'Dispecer inexistent', 'Contul nu mai există');
  }
  res.json(result.rows[0]);
}));

router.patch('/me', authenticate, asyncHandler(async (req, res) => {
  const { full_name, city } = req.body;
  if (!full_name && !city) {
    throw new AppError(400, 'Date lipsă', 'Trebuie trimis cel puțin full_name sau city');
  }

  const result = await pool.query(
    `UPDATE dispatchers
     SET full_name = COALESCE($1, full_name),
         city = COALESCE($2, city)
     WHERE id = $3
     RETURNING id, email, full_name, city, role`,
    [full_name ?? null, city ?? null, req.dispatcher.id]
  );
  res.json(result.rows[0]);
}));

router.post('/me/password', authenticate, asyncHandler(async (req, res) => {
  const { current_password, new_password } = req.body;
  if (!current_password || !new_password) {
    throw new AppError(400, 'Date lipsă', 'current_password și new_password sunt obligatorii');
  }

  const result = await pool.query(
    'SELECT password_hash FROM dispatchers WHERE id = $1',
    [req.dispatcher.id]
  );
  const matches = await bcrypt.compare(current_password, result.rows[0].password_hash);
  if (!matches) {
    throw new AppError(401, 'Parolă incorectă', 'Parola curentă nu este corectă');
  }

  const newHash = await bcrypt.hash(new_password, 10);
  await pool.query('UPDATE dispatchers SET password_hash = $1 WHERE id = $2', [newHash, req.dispatcher.id]);

  res.json({ status: 'password_updated' });
}));

router.delete('/:id', authenticate, requireRole('super_admin'), asyncHandler(async (req, res) => {
  const { id } = req.params;
  const result = await pool.query('DELETE FROM dispatchers WHERE id = $1 RETURNING id', [id]);
  if (result.rowCount === 0) throw new AppError(404, 'Dispecer inexistent', 'Nu există acest dispecer');
  res.status(204).send();
}));

export default router;