import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ErrorCode, type Permission } from '@prime-crm/shared';
import { IS_PUBLIC_KEY } from '../decorators/public.decorator';
import {
  CURRENT_USER_KEY,
  type RequestWithCurrentUser,
} from '../decorators/get-user.decorator';
import { REQUIRED_PERMISSIONS_KEY } from '../decorators/require-permission.decorator';
import { AdminRoleService } from '../services/admin-role.service';
import {
  hasAllPermissions,
  toCurrentUser,
  type TokenUser,
} from '../utils/permissions.util';

function isTokenUser(value: unknown): value is TokenUser {
  const v = value as Partial<TokenUser> | null;
  return (
    typeof v === 'object' &&
    v !== null &&
    typeof v.id === 'string' &&
    typeof v.roleId === 'string'
  );
}

/**
 * Global guard, registered right after JwtAuthGuard. On every authenticated request it builds
 * the typed `CurrentUser` (read with @GetUser()); on routes with @RequirePermission it answers
 * 403 FORBIDDEN unless the caller holds every listed key or has the built-in Admin role.
 */
@Injectable()
export class PermissionsGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly adminRole: AdminRoleService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const targets = [context.getHandler(), context.getClass()];
    const required =
      this.reflector.getAllAndOverride<Permission[] | undefined>(
        REQUIRED_PERMISSIONS_KEY,
        targets,
      ) ?? [];
    const isPublic = this.reflector.getAllAndOverride<boolean | undefined>(
      IS_PUBLIC_KEY,
      targets,
    );

    const request = context.switchToHttp().getRequest<RequestWithCurrentUser>();
    if (!isTokenUser(request.user)) {
      // No caller: only a public route without a permission requirement gets through.
      if (isPublic && required.length === 0) return true;
      throw this.forbidden();
    }

    const user = toCurrentUser(request.user, await this.adminRole.adminId());
    request[CURRENT_USER_KEY] = user;

    if (!hasAllPermissions(user, required)) throw this.forbidden();
    return true;
  }

  private forbidden(): ForbiddenException {
    return new ForbiddenException({
      message: 'You do not have permission to do this',
      error: ErrorCode.FORBIDDEN,
    });
  }
}
