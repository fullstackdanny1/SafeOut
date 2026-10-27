// Creează (sau resetează) un cont super_admin. Folosit o singură dată după deploy,
// fiindcă POST /auth/register cere deja un super_admin autentificat.
//
//   ADMIN_EMAIL=... ADMIN_PASSWORD=... ADMIN_NAME="..." ADMIN_CITY=Oradea npm run create-admin
import 'dotenv/config';
import bcrypt from 'bcrypt';
import pg from 'pg';

const { ADMIN_EMAIL, ADMIN_PASSWORD, ADMIN_NAME = 'Admin', ADMIN_CITY = 'Oradea' } = process.env;

if (!ADMIN_EMAIL || !ADMIN_PASSWORD) {
  console.error('Setează ADMIN_EMAIL și ADMIN_PASSWORD (opțional ADMIN_NAME, ADMIN_CITY).');
  process.exit(1);
}
if (ADMIN_PASSWORD.length < 8) {
  console.error('ADMIN_PASSWORD trebuie să aibă cel puțin 8 caractere.');
  process.exit(1);
}

const client = new pg.Client({ connectionString: process.env.DATABASE_URL });
await client.connect();
try {
  const hash = await bcrypt.hash(ADMIN_PASSWORD, 10);
  const result = await client.query(
    `INSERT INTO dispatchers (email, password_hash, full_name, city, role)
     VALUES (lower($1), $2, $3, $4, 'super_admin')
     ON CONFLICT (email) DO UPDATE
       SET password_hash = EXCLUDED.password_hash, role = 'super_admin'
     RETURNING id, email, city, role`,
    [ADMIN_EMAIL.trim(), hash, ADMIN_NAME, ADMIN_CITY]
  );
  console.log('Super admin gata:', result.rows[0]);
} finally {
  await client.end();
}
