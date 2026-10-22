import { config } from 'dotenv';
import { resolve } from 'node:path';

// e2e reads its settings from the environment; apps/api/.env.test fills in anything unset
// (copy .env.test.example). Nothing here hardcodes a port or a connection string, so a
// parallel agent points the suite at its own database and port block (docs/notes/testing.md):
//   DATABASE_URL=<from scripts/db-agent.mjs create> API_PORT=31N1 npm run test:e2e
// API_PORT is accepted as an alias for PORT; an explicit PORT wins.
if (!process.env.PORT && process.env.API_PORT)
  process.env.PORT = process.env.API_PORT;
config({ path: resolve(__dirname, '..', '.env.test'), quiet: true });

const url = process.env.DATABASE_URL;
if (!url)
  throw new Error('e2e needs DATABASE_URL (see apps/api/.env.test.example)');
if (!process.env.PORT)
  throw new Error(
    'e2e needs PORT or API_PORT (see apps/api/.env.test.example)',
  );

// Teardown deletes rows: refuse to run against anything but a *_test database
// (prime_crm_test, or an agent database prime_crm_<name>_test).
const database = new URL(url).pathname.replace(/^\//, '');
if (!database.endsWith('_test')) {
  throw new Error(
    `e2e refuses to run against "${database}": use a *_test database`,
  );
}
