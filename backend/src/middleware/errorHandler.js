import { AppError } from '../utils/AppError.js';

// Erori Postgres care înseamnă date greșite de la client, nu o problemă a serverului
const PG_CLIENT_ERRORS = {
  '22P02': [400, 'Date invalide', 'Unul dintre câmpuri are un format invalid'],
  '23502': [400, 'Date lipsă', 'Lipsește un câmp obligatoriu'],
  '23503': [400, 'Referință invalidă', 'Elementul referit nu există'],
  '23505': [409, 'Conflict', 'Există deja un element cu aceste date'],
  '23514': [400, 'Date invalide', 'Una dintre valori nu este permisă'],
};

function sendProblem(res, status, title, detail, type = 'about:blank') {
  res.status(status).type('application/problem+json').json({ type, title, status, detail });
}

export function errorHandler(err, req, res, next) {
  if (err instanceof AppError) {
    return sendProblem(res, err.statusCode, err.title, err.detail, err.type);
  }

  // Erori de la express.json(): JSON malformat (400), body prea mare (413) etc.
  const status = err.status || err.statusCode;
  if (status >= 400 && status < 500) {
    const detail = err.type === 'entity.parse.failed' ? 'Corpul cererii nu este JSON valid'
                 : err.type === 'entity.too.large' ? 'Corpul cererii este prea mare'
                 : err.message;
    return sendProblem(res, status, 'Cerere invalidă', detail);
  }

  if (err.code && PG_CLIENT_ERRORS[err.code]) {
    const [pgStatus, title, detail] = PG_CLIENT_ERRORS[err.code];
    return sendProblem(res, pgStatus, title, detail);
  }

  console.error('Unhandled error:', err);
  sendProblem(res, 500, 'Eroare internă de server', 'A apărut o eroare neașteptată');
}

export function notFoundHandler(req, res) {
  sendProblem(res, 404, 'Rută inexistentă', `Nu există ${req.method} ${req.originalUrl}`);
}
