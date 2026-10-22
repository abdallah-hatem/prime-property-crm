import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import type { AuthUser } from '../interfaces/jwt-payload.interface';

/** The caller's session (refresh-token family id) from the access token, if it carries one. */
export const SessionId = createParamDecorator(
  (_: unknown, ctx: ExecutionContext): string | undefined =>
    ctx.switchToHttp().getRequest<{ user?: Partial<AuthUser> }>().user
      ?.sessionId,
);
