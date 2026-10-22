import {
  BadRequestException,
  HttpException,
  HttpStatus,
  Injectable,
  OnModuleInit,
  UnauthorizedException,
} from '@nestjs/common';
import {
  AuthErrorCode,
  ErrorCode,
  toE164,
  type LoginResponse,
  type Me,
} from '@prime-crm/shared';
import { Clock } from '../../common/providers/clock';
import { hashPassword, verifyPassword } from '../../common/utils/password.util';
import { toMe } from '../../common/utils/user-shape.util';
import { DatabaseService } from '../../database/database.service';
import { isLoginLocked, loginWindowStart } from './auth.pure';
import type { ChangePasswordDto } from './dto/change-password.dto';
import type { LoginDto } from './dto/login.dto';
import type { UpdateMeDto } from './dto/update-me.dto';
import { AuthUserRepository } from './repositories/auth-user.repository';
import { LoginAttemptRepository } from './repositories/login-attempt.repository';
import { SessionService } from './session.service';

/** Sign-in and the caller's own account (`/auth/me`). Sessions live in SessionService. */
@Injectable()
export class AuthService implements OnModuleInit {
  /** Checked for an unknown email, so it costs the same time as a wrong password. */
  private decoyHash = '';

  constructor(
    private readonly db: DatabaseService,
    private readonly users: AuthUserRepository,
    private readonly attempts: LoginAttemptRepository,
    private readonly sessions: SessionService,
    private readonly clock: Clock,
  ) {}

  async onModuleInit(): Promise<void> {
    this.decoyHash = await hashPassword('decoy-password-that-never-matches');
  }

  /**
   * Unknown email, wrong password and deactivated user all answer the same 401, and each counts
   * as a failure. Once an email has 10 failures inside 15 minutes, the next attempt answers 429
   * before any check (a correct password included).
   */
  async login(dto: LoginDto): Promise<LoginResponse> {
    const now = this.clock.now();
    const windowStart = loginWindowStart(now);
    if (isLoginLocked(await this.attempts.countSince(dto.email, windowStart))) {
      throw new HttpException(
        {
          message: 'Too many failed sign-ins. Try again in a few minutes.',
          error: ErrorCode.TOO_MANY_REQUESTS,
        },
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }

    const user = await this.users.findForLogin(dto.email);
    const passwordOk = await verifyPassword(
      dto.password,
      user?.passwordHash ?? this.decoyHash,
    );
    if (!user || !passwordOk || !user.active) {
      await this.attempts.record(dto.email, now);
      await this.attempts.deleteOlderThan(windowStart);
      throw new UnauthorizedException({
        message: 'Email or password is incorrect',
        error: AuthErrorCode.INVALID_CREDENTIALS,
      });
    }

    await this.attempts.clear(dto.email);
    const { passwordHash: _hash, ...shape } = user;
    const pair = await this.sessions.start(shape);
    return { ...pair, user: toMe(shape) };
  }

  /** The caller as stored now: role and permissions are live, not the token's copy. */
  async me(userId: string): Promise<Me> {
    const user = await this.users.findShape(userId);
    if (!user?.active) throw new UnauthorizedException();
    return toMe(user);
  }

  async updateMe(userId: string, dto: UpdateMeDto): Promise<Me> {
    const updated = await this.users.updateProfile(userId, {
      name: dto.name,
      language: dto.language,
      phone: dto.phone === undefined ? undefined : toE164(dto.phone),
    });
    return toMe(updated);
  }

  /** Checks the current password, saves the new one and ends every other session. */
  async changePassword(
    userId: string,
    dto: ChangePasswordDto,
    sessionId?: string,
  ): Promise<void> {
    const stored = await this.users.findPasswordHash(userId);
    if (!stored || !(await verifyPassword(dto.currentPassword, stored))) {
      throw new BadRequestException({
        message: 'The current password is incorrect',
        error: AuthErrorCode.WRONG_PASSWORD,
      });
    }
    const passwordHash = await hashPassword(dto.newPassword);
    await this.db.transaction(async (tx) => {
      await this.users.updatePasswordHash(userId, passwordHash, tx);
      await this.sessions.revokeAllSessions(tx, userId, sessionId);
    });
  }
}
