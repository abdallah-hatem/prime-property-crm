import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import type { Env } from '../../config/env.validation';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { AuthUserRepository } from './repositories/auth-user.repository';
import { LoginAttemptRepository } from './repositories/login-attempt.repository';
import { RefreshTokenRepository } from './repositories/refresh-token.repository';
import { SessionService } from './session.service';
import { JwtStrategy } from './strategies/jwt.strategy';

/**
 * Sign-in, sessions and the caller's own account. Import it and inject SessionService to end a
 * user's sessions (`revokeAllSessions(tx, userId)`) on password reset or deactivation.
 */
@Module({
  imports: [
    PassportModule,
    JwtModule.registerAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService<Env, true>) => ({
        secret: config.get('JWT_SECRET', { infer: true }),
        signOptions: { algorithm: 'HS256' },
      }),
    }),
  ],
  controllers: [AuthController],
  providers: [
    JwtStrategy,
    AuthService,
    SessionService,
    AuthUserRepository,
    RefreshTokenRepository,
    LoginAttemptRepository,
  ],
  exports: [SessionService],
})
export class AuthModule {}
