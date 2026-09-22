import express from 'express';
import { pool, queryAsDispatcher } from '../db/db.js';
import { authenticate } from '../middleware/authenticate.js';
import { asyncHandler } from '../middleware/asyncHandler.js';
import { AppError } from '../utils/AppError.js';

const router = express.Router();
const ALLOWED_STATUSES = ['pending', 'acknowledged', 'resolved'];

router.post('/', asyncHandler(async (req, res) => {
  const {
    situation_type, city, qr_code_id, venue_name, placement,
    latitude, longitude, location_accuracy_m, location_method,
    live_tracking, victim_message
  } = req.body;

  if (!situation_type || !city) {
    throw new AppError(400, 'Date lipsă', 'situation_type și city sunt obligatorii');
  }

  const result = await queryAsDispatcher(
    { city, role: '' },
    `INSERT INTO incidents (
       situation_type, city, qr_code_id, venue_name, placement,
       latitude, longitude, location_accuracy_m, location_method,
       live_tracking, victim_message
     ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
     RETURNING *`,
    [situation_type, city, qr_code_id ?? null, venue_name ?? null, placement ?? null,
     latitude ?? null, longitude ?? null, location_accuracy_m ?? null, location_method ?? null,
     live_tracking ?? false, victim_message ?? null]
  );
  res.status(201).json(result.rows[0]);
}));

router.get('/', authenticate, asyncHandler(async (req, res) => {
  const result = await queryAsDispatcher(
    req.dispatcher,
    'SELECT * FROM incidents ORDER BY created_at DESC'
  );
  res.json(result.rows);
}));

router.patch('/:id', authenticate, asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { status } = req.body;

  if (!status || !ALLOWED_STATUSES.includes(status)) {
    throw new AppError(400, 'Status invalid', `status trebuie să fie unul din: ${ALLOWED_STATUSES.join(', ')}`);
  }

  const timestampColumn = status === 'acknowledged' ? 'acknowledged_at'
                         : status === 'resolved' ? 'resolved_at'
                         : null;

  const result = await queryAsDispatcher(
    req.dispatcher,
    `UPDATE incidents
     SET status = $1, dispatcher_id = $2
         ${timestampColumn ? `, ${timestampColumn} = now()` : ''}
     WHERE id = $3
     RETURNING *`,
    [status, req.dispatcher.id, id]
  );

  if (result.rowCount === 0) {
    throw new AppError(404, 'Incident inexistent', 'Incidentul nu există sau nu ai acces la el');
  }

  res.json(result.rows[0]);
}));

router.post('/:id/actions', authenticate, asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { action_type } = req.body;

  if (!action_type) {
    throw new AppError(400, 'Date lipsă', 'action_type este obligatoriu');
  }

  await pool.query(
    `INSERT INTO audit_log (dispatcher_id, action, detail) VALUES ($1, $2, $3)`,
    [req.dispatcher.id, action_type, `Incident #${id}`]
  );

  res.status(201).json({ status: 'logged' });
}));

export default router;