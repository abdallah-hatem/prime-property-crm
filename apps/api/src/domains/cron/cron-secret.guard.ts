import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { ErrorCode } from '@prime-crm/shared';
import type { Request } from 'express';
import { createHash, timingSafeEqual } from 'node:crypto';
import { CronConfig } from './cron.config';

const digest = (value: string) => createHash('sha256').update(value).digest();

/** True when `authorization` is exactly `Bearer <secret>` (constant-time compare). */
export function cronAuthorized(
  authorization: string | undefined,
  secret: string,
): boolean {
  return timingSafeEqual(
    digest(authorization ?? ''),
    digest(`Bearer ${secret}`),
  );
}

/**
 * The cron endpoints are public to the JWT guard but need `Authorization: Bearer
 * <CRON_SECRET>`. With CRON_SECRET unset they refuse every call (a deployment that forgot it
 * must not expose a public endpoint that deletes data).
 */
@Injectable()
export class CronSecretGuard implements CanActivate {
  constructor(private readonly config: CronConfig) {}

  canActivate(context: ExecutionContext): boolean {
    const secret = this.config.secret();
    if (!secret) {
      throw new UnauthorizedException({
        message: 'Scheduled jobs are not configured (CRON_SECRET is unset)',
        error: 'CRON_NOT_CONFIGURED',
      });
    }
    const request = context.switchToHttp().getRequest<Request>();
    if (!cronAuthorized(request.headers.authorization, secret)) {
      throw new UnauthorizedException({
        message: 'A scheduled job needs the cron secret',
        error: ErrorCode.UNAUTHORIZED,
      });
    }
    return true;
  }
}
