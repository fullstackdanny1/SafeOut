import express from 'express';
import { pool } from '../db/db.js'

const router = express.Router();

router.get('/', async (req, res) => {
  try{
    const result = await pool.query('SELECT NOW()');
    res.json({status: 'ok', db: 'connected'});
  } catch(err) {
    console.error("DB connection error", err);
    res.status(500).json({status: 'error', db: 'disconnected', error: err.message}); 
  }

})

export default router;
