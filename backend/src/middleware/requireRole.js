export function requireRole(...allowedRoles) {
  return (req, res, next) => {
    if (!req.dispatcher || !allowedRoles.includes(req.dispatcher.role)) {
      return res.status(403).json({ error: 'Nu ai permisiunea necesară pentru această acțiune' });
    }
    next();
  };
}