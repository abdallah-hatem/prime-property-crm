import { execSync } from 'node:child_process';
import { randomInt, randomUUID } from 'node:crypto';
import { resolve } from 'node:path';
import { PrismaPg } from '@prisma/adapter-pg';
import { Prisma, PrismaClient } from '@prisma/client';

/**
 * Shared e2e harness for tests that talk to the test database directly. setup-env has already
 * loaded apps/api/.env.test and refused anything but a *_test database.
 */
export function createTestDb(): PrismaClient {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error('e2e needs DATABASE_URL');
  return new PrismaClient({ adapter: new PrismaPg({ connectionString: url }) });
}

let seq = 0;
/** Timestamp plus a counter: Date.now() alone collides within a millisecond. */
export const uniqueEmail = (label: string): string =>
  `${label}-${Date.now()}-${seq++}@test.localhost`;

/** A random Egyptian mobile number as typed locally, e.g. 01012345678. */
export const randomLocalMobile = (): string =>
  `010${String(randomInt(0, 100_000_000)).padStart(8, '0')}`;

/** Test-only password: random per run, never a real credential. */
export const randomPassword = (): string => `pw-${randomUUID()}`;

/**
 * Resolves to the Prisma error code (P2002 unique, P2003 foreign key, ...) or, for errors the
 * driver adapter passes through without a code, the message. Fails the test if `op` succeeds.
 */
export async function dbError(op: PromiseLike<unknown>): Promise<string> {
  try {
    await op;
  } catch (error) {
    const e = error as { code?: unknown; message?: unknown };
    const code = typeof e.code === 'string' ? e.code : '';
    const message = typeof e.message === 'string' ? e.message : String(error);
    return `${code} ${message}`;
  }
  throw new Error('Expected the database to reject the operation');
}

/**
 * A throwaway database beside the e2e one (same server), migrated with `prisma migrate deploy`,
 * for specs that need an empty database of their own (the seed idempotency check). `drop()`
 * removes it; call it in afterAll.
 */
export async function createScratchDatabase(label: string): Promise<{
  url: string;
  db: PrismaClient;
  drop: () => Promise<void>;
}> {
  const base = process.env.DATABASE_URL;
  if (!base) throw new Error('e2e needs DATABASE_URL');
  const url = new URL(base);
  const name = `${url.pathname.slice(1)}_${label}_${process.pid}`.slice(0, 63);
  if (!/^[a-z0-9_]+$/.test(name))
    throw new Error(`unsafe scratch database name "${name}"`);
  url.pathname = `/${name}`;

  const server = createTestDb();
  try {
    await server.$executeRaw(
      Prisma.raw(`DROP DATABASE IF EXISTS "${name}" WITH (FORCE)`),
    );
    await server.$executeRaw(Prisma.raw(`CREATE DATABASE "${name}"`));
  } finally {
    await server.$disconnect();
  }
  execSync('npx prisma migrate deploy', {
    cwd: resolve(__dirname, '..'),
    env: { ...process.env, DATABASE_URL: url.toString() },
    stdio: 'pipe',
  });

  const db = new PrismaClient({
    adapter: new PrismaPg({ connectionString: url.toString() }),
  });
  return {
    url: url.toString(),
    db,
    drop: async () => {
      await db.$disconnect();
      const s = createTestDb();
      try {
        await s.$executeRaw(
          Prisma.raw(`DROP DATABASE IF EXISTS "${name}" WITH (FORCE)`),
        );
      } finally {
        await s.$disconnect();
      }
    },
  };
}
