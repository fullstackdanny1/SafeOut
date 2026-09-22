import express from 'express';
import jwt from 'jsonwebtoken';
import { pool, queryAsDispatcher } from '../db/db.js';
import { authenticate } from '../middleware/authenticate.js';
import { asyncHandler } from '../middleware/asyncHandler.js';
import { AppError } from '../utils/AppError.js';

const router = express.Router();
const ALLOWED_STATUSES = ['pending', 'acknowledged', 'resolved'];
const SITUATION_TYPES = ['emergency', 'escort', 'contact'];
const LOCATION_METHODS = ['gps', 'wifi', 'qr_fixed'];
const TRACKING_MINUTES = 15;

const toNumberOrNull = (v) => (v === null || v === undefined || v === '' || !Number.isFinite(Number(v)) ? null : Number(v));
const toIntOrNull = (v) => (Number.isInteger(Number(v)) && v !== null && v !== '' && v !== undefined ? Number(v) : null);
const cleanText = (v, max = 500) => (typeof v === 'string' && v.trim() ? v.trim().slice(0, max) : null);

function parseId(raw) {
  const id = Number(raw);
  if (!Number.isInteger(id) || id <= 0) throw new AppError(400, 'ID invalid', 'ID-ul incidentului trebuie să fie un număr întreg');
  return id;
}

router.post('/', asyncHandler(async (req, res) => {
  const {
    situation_type, city, qr_code_id, venue_name, placement,
    latitude, longitude, location_accuracy_m, location_method,
    live_tracking, victim_message
  } = req.body;

  if (!situation_type || !cleanText(city)) {
    throw new AppError(400, 'Date lipsă', 'situation_type și city sunt obligatorii');
  }
  if (!SITUATION_TYPES.includes(situation_type)) {
    throw new AppError(400, 'Tip invalid', `situation_type trebuie să fie unul din: ${SITUATION_TYPES.join(', ')}`);
  }
  const cityName = cleanText(city, 100);

  const result = await queryAsDispatcher(
    { city: cityName, role: '' },
    `INSERT INTO incidents (
       situation_type, city, qr_code_id, venue_name, placement,
       latitude, longitude, location_accuracy_m, location_method,
       live_tracking, victim_message
     ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
     RETURNING *`,
    [situation_type, cityName, toIntOrNull(qr_code_id), cleanText(venue_name, 200), cleanText(placement, 200),
     toNumberOrNull(latitude), toNumberOrNull(longitude), toNumberOrNull(location_accuracy_m),
     LOCATION_METHODS.includes(location_method) ? location_method : null,
     live_tracking === true, cleanText(victim_message, 1000)]
  );
  const incident = result.rows[0];

  // Token scurt, legat de acest incident, cu care telefonul victimei poate trimite locația live
  const tracking_token = jwt.sign(
    { incident_id: incident.id, city: incident.city, purpose: 'tracking' },
    process.env.JWT_SECRET,
    { expiresIn: `${TRACKING_MINUTES}m` }
  );

  res.status(201).json({ ...incident, tracking_token });
}));

// Public, dar protejat de tracking_token — actualizează locația live a victimei (doar pentru incidentul ei)
router.patch('/:id/location', asyncHandler(async (req, res) => {
  const id = parseId(req.params.id);
  const { tracking_token, latitude, longitude, location_accuracy_m } = req.body;

  let payload;
  try {
    payload = jwt.verify(tracking_token, process.env.JWT_SECRET);
  } catch (err) {
    throw new AppError(401, 'Token invalid', 'Tokenul de urmărire lipsește sau a expirat');
  }
  if (payload.purpose !== 'tracking' || payload.incident_id !== id) {
    throw new AppError(403, 'Acces interzis', 'Tokenul nu corespunde acestui incident');
  }

  const lat = toNumberOrNull(latitude), lng = toNumberOrNull(longitude);
  if (lat === null || lng === null) {
    throw new AppError(400, 'Date lipsă', 'latitude și longitude sunt obligatorii');
  }

  const result = await queryAsDispatcher(
    { city: payload.city, role: '' },
    `UPDATE incidents
     SET latitude = $1, longitude = $2, location_accuracy_m = $3, live_tracking = true,
         location_method = CASE WHEN $3::numeric < 50 THEN 'gps' ELSE 'wifi' END
     WHERE id = $4 AND status <> 'resolved'
     RETURNING id`,
    [lat, lng, toNumberOrNull(location_accuracy_m), id]
  );
  if (result.rowCount === 0) {
    throw new AppError(404, 'Incident inexistent', 'Incidentul nu există sau a fost deja rezolvat');
  }
  res.json({ status: 'updated' });
}));

router.get('/', authenticate, asyncHandler(async (req, res) => {
  const result = await queryAsDispatcher(
    req.dispatcher,
    'SELECT * FROM incidents ORDER BY created_at DESC'
  );
  res.json(result.rows);
}));

router.patch('/:id', authenticate, asyncHandler(async (req, res) => {
  const id = parseId(req.params.id);
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

  await pool.query(
    'INSERT INTO audit_log (dispatcher_id, action, detail) VALUES ($1, $2, $3)',
    [req.dispatcher.id, status, `Incident #${id}`]
  );

  res.json(result.rows[0]);
}));

const ALLOWED_ACTIONS = ['called_112', 'note_added'];

router.post('/:id/actions', authenticate, asyncHandler(async (req, res) => {
  const id = parseId(req.params.id);
  const { action_type } = req.body;
  const note = cleanText(req.body.note, 2000);

  if (!ALLOWED_ACTIONS.includes(action_type)) {
    throw new AppError(400, 'Acțiune invalidă', `action_type trebuie să fie unul din: ${ALLOWED_ACTIONS.join(', ')}`);
  }
  if (action_type === 'note_added' && !note) {
    throw new AppError(400, 'Date lipsă', 'note este obligatoriu pentru note_added');
  }

  // Dispecerul poate acționa doar pe incidente pe care le vede (RLS pe oraș)
  const visible = await queryAsDispatcher(req.dispatcher, 'SELECT id FROM incidents WHERE id = $1', [id]);
  if (visible.rowCount === 0) {
    throw new AppError(404, 'Incident inexistent', 'Incidentul nu există sau nu ai acces la el');
  }

  if (note) {
    const stamp = new Date().toISOString().slice(0, 16).replace('T', ' ');
    await queryAsDispatcher(
      req.dispatcher,
      `UPDATE incidents SET notes = concat_ws(E'\\n', notes, $1::text) WHERE id = $2`,
      [`[${stamp}] ${note}`, id]
    );
  }

  await pool.query(
    `INSERT INTO audit_log (dispatcher_id, action, detail) VALUES ($1, $2, $3)`,
    [req.dispatcher.id, action_type, note ? `Incident #${id}: ${note}` : `Incident #${id}`]
  );

  res.status(201).json({ status: 'logged' });
}));

export default router;