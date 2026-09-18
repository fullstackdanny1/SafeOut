import 'dotenv/config';
import pg from 'pg';

const {Pool} = pg;

console.log('DATABASE_URL încărcat:', process.env.DATABASE_URL ? 'DA' : 'NU');

export const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
});

pool.on('error', (err) => {
    console.error('Unexpected error on idle Postgres client', err);
});