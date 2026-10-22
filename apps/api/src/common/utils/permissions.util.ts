import { isPermission, type Permission } from '@prime-crm/shared';
import type { CurrentUser } from '../interfaces/current-user.interface';

/** The fields of an authenticated request's `user` this module relies on. */
export interface TokenUser {
  id: string;
  roleId: string;
  permissions?: unknown;
}

/** Builds the typed caller from the token claims. Unknown keys in the token are dropped. */
export function toCurrentUser(
  user: TokenUser,
  adminRoleId: string | null,
): CurrentUser {
  const permissions = Array.isArray(user.permissions)
    ? user.permissions.filter(isPermission)
    : [];
  return {
    id: user.id,
    roleId: user.roleId,
    permissions: [...new Set(permissions)],
    isAdmin: adminRoleId !== null && user.roleId === adminRoleId,
  };
}

/** True when the caller holds `key`. The built-in Admin role holds every key, always. */
export function hasPermission(user: CurrentUser, key: Permission): boolean {
  return user.isAdmin || user.permissions.includes(key);
}

/** True when the caller holds every one of `keys` (an empty list is always satisfied). */
export function hasAllPermissions(
  user: CurrentUser,
  keys: readonly Permission[],
): boolean {
  return keys.every((key) => hasPermission(user, key));
}
