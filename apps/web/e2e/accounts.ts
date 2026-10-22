/**
 * The seeded sign-in accounts (apps/api/prisma/seed-sample.ts, SAMPLE_ACCOUNTS). Passwords come
 * from the environment only — SEED_ADMIN_PASSWORD and SEED_MEMBER_PASSWORD, the same values the
 * seed used — never from a file in the repo.
 */
export const ROLES = {
  admin: { email: 'admin@prime.test', passwordEnv: 'SEED_ADMIN_PASSWORD' },
  member: { email: 'sara@prime.test', passwordEnv: 'SEED_MEMBER_PASSWORD' },
  lead: { email: 'layla@prime.test', passwordEnv: 'SEED_MEMBER_PASSWORD' },
} as const;

export type Role = keyof typeof ROLES;

/** Saved session for a role, written by auth.setup.ts (gitignored: it holds live tokens). */
export const storageStateFor = (role: Role): string => `e2e/.auth/${role}.json`;

/** The web shell's sign-in page (src/app/login). */
export const LOGIN_PATH = '/login';
