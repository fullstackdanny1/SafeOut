// Rulează node-pg-migrate. Dacă MIGRATION_DB_URL nu e setat (ex. pe Render, unde același
// utilizator face și migrările), folosește DATABASE_URL.
import 'dotenv/config';
import { spawnSync } from 'node:child_process';

if (!process.env.MIGRATION_DB_URL && process.env.DATABASE_URL) {
  process.env.MIGRATION_DB_URL = process.env.DATABASE_URL;
}
if (!process.env.MIGRATION_DB_URL) {
  console.error('Setează DATABASE_URL (sau MIGRATION_DB_URL) înainte de migrare.');
  process.exit(1);
}

const args = ['node_modules/node-pg-migrate/bin/node-pg-migrate.js',
  '-m', 'src/db/migrations', '--database-url-var', 'MIGRATION_DB_URL', ...process.argv.slice(2)];
const result = spawnSync(process.execPath, args, { stdio: 'inherit' });
process.exit(result.status ?? 1);
