import 'dotenv/config';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '@prisma/client';
import { seedFoundation } from './seed-foundation';

// `npm run db:seed -w @prime-crm/api` (or `prisma db seed`). Reads DATABASE_URL,
// SEED_ADMIN_EMAIL, SEED_ADMIN_PASSWORD and optional SEED_ADMIN_NAME from the environment
// (apps/api/.env fills in anything unset). No credential is ever written in this file.

function required(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`Seed needs ${name} (see apps/api/.env.example)`);
  return value;
}

async function main(): Promise<void> {
  const db = new PrismaClient({
    adapter: new PrismaPg({ connectionString: required('DATABASE_URL') }),
  });
  try {
    const result = await seedFoundation(db, {
      email: required('SEED_ADMIN_EMAIL'),
      password: required('SEED_ADMIN_PASSWORD'),
      name: process.env.SEED_ADMIN_NAME,
    });
    console.log(
      `Seeded foundation: roles Admin + Team member, default outcomes, settings, admin ${result.adminUserId}`,
    );
  } finally {
    await db.$disconnect();
  }
}

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
