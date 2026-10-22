import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import type { Env } from '../../../config/env.validation';
import type { AuthUser, JwtPayload } from '../interfaces/jwt-payload.interface';

/**
 * Verifies the access token's signature and expiry with JWT_SECRET.
 * The users task adds the "user is still active" check on every request.
 */
@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy, 'jwt') {
  constructor(config: ConfigService<Env, true>) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: config.get('JWT_SECRET', { infer: true }),
      algorithms: ['HS256'],
    });
  }

  validate(payload: Partial<JwtPayload>): AuthUser {
    if (typeof payload.sub !== 'string' || typeof payload.roleId !== 'string') {
      throw new UnauthorizedException();
    }
    return {
      id: payload.sub,
      roleId: payload.roleId,
      permissions: Array.isArray(payload.permissions)
        ? payload.permissions
        : [],
    };
  }
}
