import express from 'express';
import bcrypt from 'bcrypt';
import { pool } from '../db/db.js';
import { authenticate } from '../middleware/authenticate.js';
import { asyncHandler } from '../middleware/asyncHandler.js';
import { AppError } from '../utils/AppError.js';
import { requireRole } from '../middleware/requireRole.js';

const router = express.Router();

router.get('/', authenticate, requireRole('super_admin'), asyncHandler(async (req, res) => {
  const result = await pool.query(
    'SELECT id, email, full_name, city, role, created_at FROM dispatchers ORDER BY created_at DESC'
  );
  res.json(result.rows);
}));

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
  const { full_name } = req.body;
  // Orașul decide ce incidente vede dispecerul (RLS), deci doar super_admin și-l poate schimba
  const city = req.dispatcher.role === 'super_admin' ? req.body.city : undefined;
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
  if (result.rowCount === 0) {
    throw new AppError(404, 'Dispecer inexistent', 'Contul nu mai există');
  }
  const matches = await bcrypt.compare(current_password, result.rows[0].password_hash);
  if (!matches) {
    throw new AppError(401, 'Parolă incorectă', 'Parola curentă nu este corectă');
  }

  if (String(new_password).length < 6) {
    throw new AppError(400, 'Parolă prea scurtă', 'Parola nouă trebuie să aibă cel puțin 6 caractere');
  }

  const newHash = await bcrypt.hash(new_password, 10);
  await pool.query('UPDATE dispatchers SET password_hash = $1 WHERE id = $2', [newHash, req.dispatcher.id]);

  res.json({ status: 'password_updated' });
}));

router.delete('/:id', authenticate, requireRole('super_admin'), asyncHandler(async (req, res) => {
  const { id } = req.params;
  if (Number(id) === req.dispatcher.id) {
    throw new AppError(400, 'Acțiune interzisă', 'Nu îți poți șterge propriul cont');
  }
  const result = await pool.query('DELETE FROM dispatchers WHERE id = $1 RETURNING id', [id]);
  if (result.rowCount === 0) throw new AppError(404, 'Dispecer inexistent', 'Nu există acest dispecer');
  res.status(204).send();
}));

export default router;