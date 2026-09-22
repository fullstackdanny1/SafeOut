import jwt from 'jsonwebtoken';

export function authenticate(req, res, next) {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Missing token or invalid format!' });
  }

  const token = authHeader.split(' ')[1];

  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET);
    req.dispatcher = payload; // { id, city, role }
    next();
  } catch (err) {
    return res.status(401).json({ error: 'Token expired or is invalid!' });
  }
}