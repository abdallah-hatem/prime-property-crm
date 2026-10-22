import {
  type CanActivate,
  type ExecutionContext,
  ForbiddenException,
  UseGuards,
} from '@nestjs/common';
import { ErrorCode, type Permission } from '@prime-crm/shared';
import {
  CURRENT_USER_KEY,
  type RequestWithCurrentUser,
} from '../../common/decorators/get-user.decorator';
import { hasPermission } from '../../common/utils/permissions.util';

type Keys = readonly [Permission, ...Permission[]];

/** Route guard behind `@RequireAnyPermission`; runs after the global PermissionsGuard. */
class AnyPermissionGuard implements CanActivate {
  constructor(private readonly keys: Keys) {}

  canActivate(context: ExecutionContext): boolean {
    const user = context.switchToHttp().getRequest<RequestWithCurrentUser>()[
      CURRENT_USER_KEY
    ];
    if (user && this.keys.some((key) => hasPermission(user, key))) return true;
    throw new ForbiddenException({
      message: 'You do not have permission to do this',
      error: ErrorCode.FORBIDDEN,
    });
  }
}

/**
 * For routes the contract opens to "x or y" (`@RequirePermission` means all of them): 403
 * FORBIDDEN, the global guard's answer, unless the caller holds at least one of `keys` (Admin
 * always does). Checked before the body or query is validated, like `@RequirePermission`.
 *
 * @example @RequireAnyPermission('roles.manage', 'users.manage')
 */
export const RequireAnyPermission = (...keys: Keys) =>
  UseGuards(new AnyPermissionGuard(keys));
