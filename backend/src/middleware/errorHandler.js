import { AppError } from '../utils/AppError.js';

export function errorHandler(err, req, res, next) {
  if (err instanceof AppError) {
    return res.status(err.statusCode).type('application/problem+json').json({
      type: err.type,
      title: err.title,
      status: err.statusCode,
      detail: err.detail
    });
  }

  console.error('Unhandled error:', err);
  res.status(500).type('application/problem+json').json({
    type: 'about:blank',
    title: 'Eroare internă de server',
    status: 500,
    detail: 'A apărut o eroare neașteptată'
  });
}

export function notFoundHandler(req, res) {
  res.status(404).type('application/problem+json').json({
    type: 'about:blank',
    title: 'Rută inexistentă',
    status: 404,
    detail: `Nu există ${req.method} ${req.originalUrl}`
  });
}