import type { Prisma } from '@prisma/client';
import {
  BuiltInRole,
  isPermission,
  PERMISSION_KEYS,
  type Me,
  type Permission,
  type User,
} from '@prime-crm/shared';

/**
 * The columns behind the contract's `User` and `Me` shapes. Repositories pass this as `select`
 * (never a bare findUnique: the row carries the password hash); `toUser` / `toMe` map the row.
 * The users task (T5) reuses both for `/users`.
 */
export const USER_SHAPE_SELECT = {
  id: true,
  name: true,
  email: true,
  phone: true,
  language: true,
  active: true,
  createdAt: true,
  role: {
    select: { id: true, name: true, builtIn: true, permissions: true },
  },
} as const satisfies Prisma.UserSelect;

export type UserShapeRow = Prisma.UserGetPayload<{
  select: typeof USER_SHAPE_SELECT;
}>;

/** The role fields that decide a user's permissions. */
export interface RolePermissionSource {
  builtIn: string | null;
  permissions: string[];
}

/**
 * A role's effective permission keys: the built-in Admin role holds every key, always (even one
 * added to the list after the role was saved); other roles hold their known keys.
 */
export function rolePermissions(role: RolePermissionSource): Permission[] {
  if (role.builtIn === BuiltInRole.ADMIN) return [...PERMISSION_KEYS];
  return [...new Set(role.permissions.filter(isPermission))];
}

export function toUser(row: UserShapeRow): User {
  return {
    id: row.id,
    name: row.name,
    email: row.email,
    phone: row.phone,
    language: row.language,
    active: row.active,
    role: { id: row.role.id, name: row.role.name },
    createdAt: row.createdAt.toISOString(),
  };
}

export function toMe(row: UserShapeRow): Me {
  return { ...toUser(row), permissions: rolePermissions(row.role) };
}
