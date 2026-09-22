import express from 'express';
import { pool } from '../db/db.js';
import { authenticate } from '../middleware/authenticate.js';
import { requireRole } from '../middleware/requireRole.js';
import { asyncHandler } from '../middleware/asyncHandler.js';
import { AppError } from '../utils/AppError.js';

const router = express.Router();

function isValidUrl(string) {
  try {
    new URL(string);
    return true;
  } catch (_) {
    return false;  
  }
}

router.post('/', asyncHandler(async (req, res) => {
  const { incident_id, file_type, storage_url } = req.body;

  if (!incident_id || !file_type || !storage_url) {
    throw new AppError(400, 'Date lipsă', 'incident_id, file_type și storage_url sunt obligatorii');
  }
  if (!['photo', 'audio'].includes(file_type)) {
    throw new AppError(400, 'Tip invalid', 'file_type trebuie să fie photo sau audio');
  }
  if (!isValidUrl(storage_url) && !storage_url.startsWith('/uploads/')) {
    throw new AppError(400, 'URL Invalid', 'storage_url trebuie să fie o adresă URL validă sau o cale de upload');
  }

  const result = await pool.query(
    `INSERT INTO evidence (incident_id, file_type, storage_url) VALUES ($1,$2,$3) RETURNING id, incident_id, file_type, uploaded_at`,
    [incident_id, file_type, storage_url]
  );
  res.status(201).json(result.rows[0]);
}));

// Protejat — dispecerul vede lista de dovezi (fără conținutul brut în listare, doar metadate)
router.get('/', authenticate, requireRole('super_admin'), asyncHandler(async (req, res) => {
  const result = await pool.query(
    'SELECT id, incident_id, file_type, legal_hold, uploaded_at, expires_at FROM evidence ORDER BY uploaded_at DESC'
  );
  res.json(result.rows);
}));

// Protejat — conținutul efectiv (storage_url), doar la cerere explicită, per element
router.get('/:id', authenticate, asyncHandler(async (req, res) => {
  const { id } = req.params;
  const result = await pool.query('SELECT * FROM evidence WHERE id = $1', [id]);
  if (result.rowCount === 0) throw new AppError(404, 'Dovadă inexistentă', 'Nu există această dovadă');
  res.json(result.rows[0]);
}));

router.patch('/:id', authenticate, requireRole('super_admin'), asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { legal_hold } = req.body;
  const result = await pool.query('UPDATE evidence SET legal_hold = $1 WHERE id = $2 RETURNING *', [legal_hold, id]);
  if (result.rowCount === 0) throw new AppError(404, 'Dovadă inexistentă', 'Nu există această dovadă');
  res.json(result.rows[0]);
}));

export default router;