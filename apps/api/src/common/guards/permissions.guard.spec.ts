import { ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { PERMISSION_KEYS, type Permission } from '@prime-crm/shared';
import { Public } from '../decorators/public.decorator';
import { RequirePermission } from '../decorators/require-permission.decorator';
import {
  CURRENT_USER_KEY,
  type RequestWithCurrentUser,
} from '../decorators/get-user.decorator';
import type { AdminRoleService } from '../services/admin-role.service';
import { PermissionsGuard } from './permissions.guard';

const ADMIN_ROLE = 'role-admin';
const CUSTOM_ROLE = 'role-custom';

/** A permission that is not in the fixed list today, as if it were added after the token. */
const ADDED_LATER = 'reports.view' as Permission;

class Probe {
  @RequirePermission('owners.assign') assign() {}
  @RequirePermission(ADDED_LATER) future() {}
  @RequirePermission('trash.restore', 'activity.view') both() {}
  plain() {}
  @Public() open() {}
}

function makeGuard(adminId: string | null = ADMIN_ROLE) {
  const adminRole = {
    adminId: jest.fn().mockResolvedValue(adminId),
  } as unknown as AdminRoleService;
  return new PermissionsGuard(new Reflector(), adminRole);
}

function contextFor(
  method: keyof Probe,
  user?: { id: string; roleId: string; permissions: string[] },
) {
  const request: RequestWithCurrentUser = { user };
  const context = {
    getHandler: () => Probe.prototype[method],
    getClass: () => Probe,
    switchToHttp: () => ({ getRequest: () => request }),
  } as unknown as ExecutionContext;
  return { context, request };
}

const member = (permissions: string[] = [], roleId = CUSTOM_ROLE) => ({
  id: 'user-1',
  roleId,
  permissions,
});

describe('PermissionsGuard', () => {
  it("Endpoint with @RequirePermission('x') and a user without x → 403", async () => {
    const { context } = contextFor('assign', member(['activity.view']));
    await expect(makeGuard().canActivate(context)).rejects.toThrow(
      ForbiddenException,
    );
  });

  it('Admin role always passes every permission check, even a permission added to the list later', async () => {
    const guard = makeGuard();
    // The Admin token carries no keys at all: the role, not the list, decides.
    for (const method of ['assign', 'future', 'both', 'plain'] as const) {
      const { context } = contextFor(method, member([], ADMIN_ROLE));
      await expect(guard.canActivate(context)).resolves.toBe(true);
    }
    // A non-admin holding every key known today is still refused the new one.
    const { context } = contextFor('future', member([...PERMISSION_KEYS]));
    await expect(guard.canActivate(context)).rejects.toThrow(
      ForbiddenException,
    );
  });

  it('Custom role with only owners.assign passes that check and is refused every other permission', async () => {
    const guard = makeGuard();
    const caller = member(['owners.assign']);

    await expect(
      guard.canActivate(contextFor('assign', caller).context),
    ).resolves.toBe(true);

    for (const key of PERMISSION_KEYS.filter((k) => k !== 'owners.assign')) {
      class OneKey {
        @RequirePermission(key) handler() {}
      }
      const request: RequestWithCurrentUser = { user: caller };
      const context = {
        getHandler: () => OneKey.prototype.handler,
        getClass: () => OneKey,
        switchToHttp: () => ({ getRequest: () => request }),
      } as unknown as ExecutionContext;
      await expect(guard.canActivate(context)).rejects.toThrow(
        ForbiddenException,
      );
    }
  });

  it('requires every listed key when a route names several', async () => {
    const guard = makeGuard();
    await expect(
      guard.canActivate(contextFor('both', member(['trash.restore'])).context),
    ).rejects.toThrow(ForbiddenException);
    await expect(
      guard.canActivate(
        contextFor('both', member(['trash.restore', 'activity.view'])).context,
      ),
    ).resolves.toBe(true);
  });

  it('lets any signed-in user through a route without @RequirePermission', async () => {
    await expect(
      makeGuard().canActivate(contextFor('plain', member()).context),
    ).resolves.toBe(true);
  });

  it('attaches the typed current user, dropping unknown keys from the token', async () => {
    const { context, request } = contextFor(
      'plain',
      member(['owners.assign', 'not.a.permission', 'owners.assign']),
    );
    await makeGuard().canActivate(context);
    expect(request[CURRENT_USER_KEY]).toEqual({
      id: 'user-1',
      roleId: CUSTOM_ROLE,
      permissions: ['owners.assign'],
      isAdmin: false,
    });
  });

  it('marks the built-in Admin role by id, and nobody when no Admin role exists', async () => {
    const admin = contextFor('plain', member([], ADMIN_ROLE));
    await makeGuard().canActivate(admin.context);
    expect(admin.request[CURRENT_USER_KEY]?.isAdmin).toBe(true);

    const noAdmin = contextFor('assign', member([], ADMIN_ROLE));
    await expect(makeGuard(null).canActivate(noAdmin.context)).rejects.toThrow(
      ForbiddenException,
    );
  });

  it('passes a public route with no caller, refuses a permission route with none', async () => {
    await expect(
      makeGuard().canActivate(contextFor('open').context),
    ).resolves.toBe(true);
    await expect(
      makeGuard().canActivate(contextFor('assign').context),
    ).rejects.toThrow(ForbiddenException);
  });
});
