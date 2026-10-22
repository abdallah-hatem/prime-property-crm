import 'dotenv/config';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '@prisma/client';
import { seedFoundation } from './seed-foundation';
import { sampleSeedGate, seedSample } from './seed-sample';

// `npm run db:seed -w @prime-crm/api` (or `prisma db seed`). Reads from the environment
// (apps/api/.env fills in anything unset); no credential is ever written in this file:
// - DATABASE_URL, SEED_ADMIN_EMAIL, SEED_ADMIN_PASSWORD, optional SEED_ADMIN_NAME — foundation
//   (roles, default outcomes, settings, first admin). Runs everywhere, production included.
// - SEED_ALLOW_SAMPLE=true and SEED_MEMBER_PASSWORD — sample data for every flow
//   (prisma/seed-sample.ts). Local and preview only: skipped when the flag is unset, refused
//   with NODE_ENV=production.

function required(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`Seed needs ${name} (see apps/api/.env.example)`);
  return value;
}

async function main(): Promise<void> {
  // Decide before writing anything, so a refused production run leaves the database untouched.
  const sample = sampleSeedGate(process.env);
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

    if (sample === 'skip') {
      console.log('Sample data skipped (set SEED_ALLOW_SAMPLE=true to add it)');
      return;
    }
    const counts = await seedSample(db, {
      adminPassword: required('SEED_ADMIN_PASSWORD'),
      memberPassword: required('SEED_MEMBER_PASSWORD'),
    });
    console.log(
      `Seeded sample: ${Object.entries(counts)
        .map(([k, v]) => `${k} ${v}`)
        .join(', ')}`,
    );
  } finally {
    await db.$disconnect();
  }
}

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
