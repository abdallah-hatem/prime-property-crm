import {
  BuiltInRole,
  PERMISSION_KEYS,
  type Permission,
  type Role,
} from '@prime-crm/shared';
import { rolePermissions } from '../../common/utils/user-shape.util';
import type { RoleRow } from './repositories/role.repository';

/** The contract's `Role`. Admin's permissions are every key, whatever the row stores. */
export function toRole(row: RoleRow): Role {
  return {
    id: row.id,
    name: row.name,
    builtIn: row.builtIn,
    permissions: rolePermissions(row),
    userCount: row._count.users,
  };
}

/** Each key once, in the fixed list's order (so saved lists compare and read the same). */
export function canonicalPermissions(
  keys: readonly Permission[],
): Permission[] {
  const wanted = new Set(keys);
  return PERMISSION_KEYS.filter((key) => wanted.has(key));
}

/** Keys in `next` but not `prev`, and the other way round. */
export function permissionDiff(
  prev: readonly Permission[],
  next: readonly Permission[],
): { added: Permission[]; removed: Permission[] } {
  return {
    added: next.filter((key) => !prev.includes(key)),
    removed: prev.filter((key) => !next.includes(key)),
  };
}

/**
 * Admin's permissions can't change: a `permissions` field other than the full list is refused.
 * (Sending the full list back unchanged is accepted, so a form can post every field.)
 */
export function changesAdminPermissions(
  builtIn: BuiltInRole | null,
  permissions: readonly Permission[] | undefined,
): boolean {
  if (builtIn !== BuiltInRole.ADMIN || permissions === undefined) return false;
  return canonicalPermissions(permissions).length !== PERMISSION_KEYS.length;
}
