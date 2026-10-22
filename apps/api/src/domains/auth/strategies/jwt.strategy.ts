import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { ErrorCode } from '@prime-crm/shared';
import { ExtractJwt, Strategy } from 'passport-jwt';
import type { Env } from '../../../config/env.validation';
import type { AuthUser, JwtPayload } from '../interfaces/jwt-payload.interface';
import { AuthUserRepository } from '../repositories/auth-user.repository';

/**
 * Verifies the access token's signature and expiry with JWT_SECRET, then checks on every
 * request that the user still exists and is active (a deactivated user's token stops working
 * at once). Role and permissions come from the token: they are at most 15 minutes old, which
 * the contract allows ("reflected in the next access token"); /auth/me reads them live.
 */
@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy, 'jwt') {
  constructor(
    config: ConfigService<Env, true>,
    private readonly users: AuthUserRepository,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: config.get('JWT_SECRET', { infer: true }),
      algorithms: ['HS256'],
    });
  }

  async validate(payload: Partial<JwtPayload>): Promise<AuthUser> {
    if (typeof payload.sub !== 'string' || typeof payload.roleId !== 'string') {
      throw this.unauthorized();
    }
    if (!(await this.users.isActive(payload.sub))) throw this.unauthorized();
    return {
      id: payload.sub,
      roleId: payload.roleId,
      permissions: Array.isArray(payload.permissions)
        ? payload.permissions
        : [],
      sessionId: typeof payload.sid === 'string' ? payload.sid : undefined,
    };
  }

  private unauthorized(): UnauthorizedException {
    return new UnauthorizedException({
      message: 'Your session has ended. Sign in again.',
      error: ErrorCode.UNAUTHORIZED,
    });
  }
}
