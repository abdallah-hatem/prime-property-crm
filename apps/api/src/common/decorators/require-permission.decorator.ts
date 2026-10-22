import { SetMetadata } from '@nestjs/common';
import type { Permission } from '@prime-crm/shared';

export const REQUIRED_PERMISSIONS_KEY = 'requiredPermissions';

/**
 * The caller must hold **every** listed permission (checked by the global PermissionsGuard,
 * 403 otherwise). The built-in Admin role always passes. On a class, it applies to every route;
 * a method-level decorator replaces the class-level list.
 *
 * @example @RequirePermission('trash.restore')
 */
export const RequirePermission = (...keys: [Permission, ...Permission[]]) =>
  SetMetadata(REQUIRED_PERMISSIONS_KEY, keys);
