import { config } from 'dotenv';
import { resolve } from 'node:path';

// e2e reads its settings from the environment; apps/api/.env.test fills in anything unset
// (copy .env.test.example). Nothing here hardcodes a port or a connection string.
config({ path: resolve(__dirname, '..', '.env.test'), quiet: true });

const url = process.env.DATABASE_URL;
if (!url)
  throw new Error('e2e needs DATABASE_URL (see apps/api/.env.test.example)');
if (!process.env.PORT)
  throw new Error('e2e needs PORT (see apps/api/.env.test.example)');

// Teardown deletes rows: refuse to run against anything but a *_test database.
const database = new URL(url).pathname.replace(/^\//, '');
if (!database.endsWith('_test')) {
  throw new Error(
    `e2e refuses to run against "${database}": use a *_test database`,
  );
}
