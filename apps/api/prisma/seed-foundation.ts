import type { PrismaClient } from '@prisma/client';
import {
  AD_CHECK_IN_DAYS_DEFAULT,
  BUILT_IN_ROLES,
  DEFAULT_CALL_OUTCOMES,
} from '@prime-crm/shared';
import { hashPassword } from '../src/common/utils/password.util';

export interface SeedAdmin {
  email: string;
  password: string;
  name?: string;
}

export interface FoundationSeedResult {
  adminRoleId: string;
  teamMemberRoleId: string;
  adminUserId: string;
}

/**
 * Foundation data every environment needs: the two built-in roles, the default call outcomes,
 * the settings row and a first admin. Idempotent — safe to run on every deploy:
 * - Admin's permissions are reset to the full list (Admin always holds every key, including
 *   keys added later); Team member keeps whatever the admin gave it.
 * - Default outcomes are created only while the table is empty, so an admin's renames,
 *   hides and deletions are never undone.
 * - The settings row and the admin user are created if missing and otherwise left alone
 *   (a re-seed never resets the admin's password).
 */
export async function seedFoundation(
  db: PrismaClient,
  admin: SeedAdmin,
): Promise<FoundationSeedResult> {
  const email = admin.email.trim().toLowerCase();
  if (!email.includes('@')) throw new Error('Seed admin email is invalid');
  if (admin.password.length < 8)
    throw new Error('Seed admin password must be at least 8 characters');
  const passwordHash = await hashPassword(admin.password);

  return db.$transaction(async (tx) => {
    const adminRole = await tx.role.upsert({
      where: { builtIn: 'ADMIN' },
      create: {
        name: BUILT_IN_ROLES.ADMIN.name,
        builtIn: 'ADMIN',
        permissions: [...BUILT_IN_ROLES.ADMIN.permissions],
      },
      update: { permissions: [...BUILT_IN_ROLES.ADMIN.permissions] },
    });

    const teamMemberRole = await tx.role.upsert({
      where: { builtIn: 'TEAM_MEMBER' },
      create: {
        name: BUILT_IN_ROLES.TEAM_MEMBER.name,
        builtIn: 'TEAM_MEMBER',
        permissions: [...BUILT_IN_ROLES.TEAM_MEMBER.permissions],
      },
      update: {},
    });

    if ((await tx.callOutcome.count()) === 0) {
      await tx.callOutcome.createMany({
        data: DEFAULT_CALL_OUTCOMES.map((o) => ({
          labelEn: o.labelEn,
          labelAr: o.labelAr,
          setsStatus: o.setsStatus,
          order: o.order,
        })),
      });
    }

    await tx.setting.upsert({
      where: { id: 1 },
      create: { id: 1, adCheckInDays: AD_CHECK_IN_DAYS_DEFAULT },
      update: {},
    });

    const adminUser = await tx.user.upsert({
      where: { email },
      create: {
        name: admin.name?.trim() || 'Admin',
        email,
        passwordHash,
        roleId: adminRole.id,
      },
      update: {},
    });

    return {
      adminRoleId: adminRole.id,
      teamMemberRoleId: teamMemberRole.id,
      adminUserId: adminUser.id,
    };
  });
}
