import express from 'express';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import { pool } from '../db/db.js';
import { authenticate } from '../middleware/authenticate.js';
import { requireRole } from '../middleware/requireRole.js';

const router = express.Router();
const SALT_ROUNDS = 10;

router.post('/register', authenticate, requireRole('super_admin'), async (req, res) => {
  const { email, password, full_name, city, role } = req.body;

  if (!email || !password || !full_name || !city) {
    return res.status(400).json({ error: 'email, password, full_name and city are mandatory!' });
  }
  if (role && !['dispatcher', 'super_admin'].includes(role)) {
    return res.status(400).json({ error: 'role must be dispatcher or super_admin' });
  }
  if (String(password).length < 6) {
    return res.status(400).json({ error: 'password must have at least 6 characters' });
  }

  try {
    const password_hash = await bcrypt.hash(password, SALT_ROUNDS);

    const result = await pool.query(
      `INSERT INTO dispatchers (email, password_hash, full_name, city, role)
       VALUES ($1, $2, $3, $4, COALESCE($5, 'dispatcher'))
       RETURNING id, email, full_name, city, role, created_at`,
      [String(email).trim().toLowerCase(), password_hash, full_name, city, role ?? null]
    );

    res.status(201).json(result.rows[0]);
  } catch (err) {
    if (err.code === '23505') {
      return res.status(409).json({ error: 'There is already a dispatcher with this email!' });
    }
    console.error('Register error', err);
    res.status(500).json({ error: 'Eroare internă' });
  }
});

router.post('/login', async (req, res) => {
  const { email, password } = req.body;

  if (!email || !password) {
    return res.status(400).json({ error: 'email and password are mandatory!' });
  }

  try {
    const result = await pool.query(
      'SELECT id, email, password_hash, full_name, city, role FROM dispatchers WHERE lower(email) = lower($1)',
      [String(email).trim()]
    );
    const dispatcher = result.rows[0];

    if (!dispatcher) {
      return res.status(401).json({ error: 'Incorrect email and password!' });
    }

    const passwordMatches = await bcrypt.compare(password, dispatcher.password_hash);
    if (!passwordMatches) {
      return res.status(401).json({ error: 'Incorrect email and password!' });
    }

    const token = jwt.sign(
      { id: dispatcher.id, city: dispatcher.city, role: dispatcher.role },
      process.env.JWT_SECRET,
      { expiresIn: '8h' }
    );

    res.json({
      access_token: token,
      dispatcher: {
        id: dispatcher.id,
        email: dispatcher.email,
        full_name: dispatcher.full_name,
        city: dispatcher.city,
        role: dispatcher.role
      }
    });
  } catch (err) {
    console.error('Login error', err);
    res.status(500).json({ error: 'Internal error!' });
  }
});

export default router;