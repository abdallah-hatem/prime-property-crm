import {
  createParamDecorator,
  ExecutionContext,
  UnauthorizedException,
} from '@nestjs/common';
import type { CurrentUser } from '../interfaces/current-user.interface';

/** Where PermissionsGuard stores the typed caller on the request. */
export const CURRENT_USER_KEY = 'currentUser';

export type RequestWithCurrentUser = {
  user?: unknown;
  [CURRENT_USER_KEY]?: CurrentUser;
};

/**
 * The typed caller (`CurrentUser`) or one of its fields: `@GetUser() user`, `@GetUser('id') id`.
 * Ownership is always decided from this, never from an id in the body or params.
 */
export const GetUser = createParamDecorator(
  (field: keyof CurrentUser | undefined, ctx: ExecutionContext) => {
    const request = ctx.switchToHttp().getRequest<RequestWithCurrentUser>();
    const user = request[CURRENT_USER_KEY];
    if (!user) throw new UnauthorizedException();
    return field ? user[field] : user;
  },
);
