import { execSync } from 'node:child_process';
import { resolve } from 'node:path';
import './setup-env';

/**
 * Runs once before the e2e suite: applies every migration to the test database, so a fresh
 * checkout (or a new migration) needs no manual step. setup-env loads .env.test and refuses
 * any database that isn't *_test.
 */
export default function globalSetup(): void {
  execSync('npx prisma migrate deploy', {
    cwd: resolve(__dirname, '..'),
    env: process.env,
    stdio: 'pipe',
  });
}
