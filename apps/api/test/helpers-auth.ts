import { JwtService } from '@nestjs/jwt';
import type { PrismaClient } from '@prisma/client';
import { PERMISSION_KEYS } from '@prime-crm/shared';
import { uniqueEmail } from './helpers';

/**
 * e2e auth fixtures that don't depend on the seed or the auth endpoints: roles and users are
 * created directly, access tokens are signed with the test JWT_SECRET (setup-env loaded it).
 */
export interface TokenClaims {
  sub: string;
  roleId: string;
  permissions: string[];
}

const jwt = () => {
  const secret = process.env.JWT_SECRET;
  if (!secret) throw new Error('e2e needs JWT_SECRET (see .env.test.example)');
  return new JwtService({ secret, signOptions: { algorithm: 'HS256' } });
};

/** A valid 15-minute access token for these claims. */
export function signAccessToken(claims: TokenClaims): string {
  return jwt().sign(claims, { expiresIn: '15m' });
}

/** A token that expired a minute ago. */
export function signExpiredToken(claims: TokenClaims): string {
  return jwt().sign({
    ...claims,
    exp: Math.floor(Date.now() / 1000) - 60,
  });
}

export const bearer = (token: string) => ({
  Authorization: `Bearer ${token}`,
});

/** The built-in roles, created if this database has never been seeded (found by builtIn). */
export async function ensureBuiltInRoles(
  db: PrismaClient,
): Promise<{ adminRoleId: string; memberRoleId: string }> {
  const admin = await db.role.upsert({
    where: { builtIn: 'ADMIN' },
    update: {},
    create: { name: 'Admin', builtIn: 'ADMIN', permissions: PERMISSION_KEYS },
  });
  const member = await db.role.upsert({
    where: { builtIn: 'TEAM_MEMBER' },
    update: {},
    create: { name: 'Team member', builtIn: 'TEAM_MEMBER', permissions: [] },
  });
  return { adminRoleId: admin.id, memberRoleId: member.id };
}

/** A user on `roleId` plus a token carrying `permissions`. */
export async function createUserWithToken(
  db: PrismaClient,
  label: string,
  roleId: string,
  permissions: string[],
): Promise<{ id: string; name: string; token: string; claims: TokenClaims }> {
  const user = await db.user.create({
    data: {
      name: `E2E ${label}`,
      email: uniqueEmail(label),
      passwordHash: 'not-a-real-hash',
      roleId,
    },
  });
  const claims = { sub: user.id, roleId, permissions };
  return {
    id: user.id,
    name: user.name,
    token: signAccessToken(claims),
    claims,
  };
}
