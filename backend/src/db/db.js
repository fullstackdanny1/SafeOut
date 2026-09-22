import 'dotenv/config';
import pg from 'pg';

const {Pool} = pg;

console.log('DATABASE_URL încărcat:', process.env.DATABASE_URL ? 'DA' : 'NU');

export const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
});

pool.query('SELECT current_user, current_database()').then(r => {
  console.log('Node se conectează ca:', r.rows[0]);
});

pool.on('error', (err) => {
    console.error('Unexpected error on idle Postgres client', err);
});

export async function queryAsDispatcher(dispatcher, queryText, params = []) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query(`SELECT set_config('app.current_city', $1, true)`, [dispatcher.city]);
    await client.query(`SELECT set_config('app.current_role', $1, true)`, [dispatcher.role]);

    const result = await client.query(queryText, params);

    await client.query('COMMIT');
    return result;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}



