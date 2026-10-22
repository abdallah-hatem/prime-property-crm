import type { Permission } from '@prime-crm/shared';

/**
 * The caller, as every service sees it: built from the access token by PermissionsGuard.
 * `isAdmin` comes from the built-in Admin role (Role.builtIn), never from the role's name or
 * its permission list, so the Admin role passes checks for keys added after the token was issued.
 */
export interface CurrentUser {
  id: string;
  roleId: string;
  permissions: Permission[];
  isAdmin: boolean;
}
