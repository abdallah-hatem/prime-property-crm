import { randomBytes, randomUUID } from 'node:crypto';
import { Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import {
  ACCESS_TOKEN_TTL_SECONDS,
  AuthErrorCode,
  type TokenPair,
} from '@prime-crm/shared';
import type { Tx } from '../../common/interfaces/transaction.interface';
import { Clock } from '../../common/providers/clock';
import {
  rolePermissions,
  type UserShapeRow,
} from '../../common/utils/user-shape.util';
import { DatabaseService } from '../../database/database.service';
import { decideRefresh, hashRefreshToken, refreshExpiry } from './auth.pure';
import type { JwtPayload } from './interfaces/jwt-payload.interface';
import { AuthUserRepository } from './repositories/auth-user.repository';
import { RefreshTokenRepository } from './repositories/refresh-token.repository';

type RefreshOutcome =
  | { kind: 'ISSUED'; pair: TokenPair }
  | { kind: 'REJECTED'; revokeFamilyId?: string };

/**
 * Sessions: one refresh-token family per sign-in. Refresh rotates the token; a token reused
 * within the grace window gets a fresh pair in the same family, reused later revokes the family.
 *
 * Exported by AuthModule. Users (password reset) and admin-ops (deactivation) call
 * `revokeAllSessions(tx, userId)` inside their own transaction.
 */
@Injectable()
export class SessionService {
  constructor(
    private readonly db: DatabaseService,
    private readonly tokens: RefreshTokenRepository,
    private readonly users: AuthUserRepository,
    private readonly jwt: JwtService,
    private readonly clock: Clock,
  ) {}

  /** Starts a new session (family) for a signed-in user. */
  async start(user: UserShapeRow): Promise<TokenPair> {
    const familyId = randomUUID();
    const refreshToken = await this.issueRefresh(user.id, familyId);
    return { accessToken: this.signAccess(user, familyId), refreshToken };
  }

  async refresh(presented: string): Promise<TokenPair> {
    const outcome = await this.db.transaction((tx) =>
      this.rotate(presented, tx),
    );
    if (outcome.kind === 'ISSUED') return outcome.pair;
    // Revoke after the transaction: a throw inside it would roll the revocation back.
    if (outcome.revokeFamilyId) {
      await this.tokens.revokeFamily(outcome.revokeFamilyId, this.clock.now());
    }
    throw new UnauthorizedException({
      message: 'Your session has ended. Sign in again.',
      error: AuthErrorCode.INVALID_REFRESH,
    });
  }

  /** Ends the session the token belongs to, if it is the caller's. Unknown tokens are ignored. */
  async logout(userId: string, presented: string): Promise<void> {
    const token = await this.tokens.findByHash(hashRefreshToken(presented));
    if (token && token.userId === userId) {
      await this.tokens.revokeFamily(token.familyId, this.clock.now());
    }
  }

  /**
   * Revokes every refresh token of `userId` (all sessions end within the access token's
   * 15 minutes, at once for a deactivated user). `keepSessionId` spares one family: the
   * caller's own session when they change their own password.
   */
  async revokeAllSessions(
    tx: Tx,
    userId: string,
    keepSessionId?: string,
  ): Promise<number> {
    return this.tokens.revokeAllForUser(
      userId,
      this.clock.now(),
      tx,
      keepSessionId,
    );
  }

  private async rotate(presented: string, tx: Tx): Promise<RefreshOutcome> {
    const now = this.clock.now();
    const hash = hashRefreshToken(presented);
    let token = await this.tokens.findByHash(hash, tx);
    let decision = decideRefresh(token, now);

    if (
      token &&
      decision === 'ROTATE' &&
      !(await this.tokens.claim(token.id, now, tx))
    ) {
      // A concurrent refresh used it first: re-read and decide again (normally GRACE).
      token = await this.tokens.findByHash(hash, tx);
      decision = decideRefresh(token, now);
    }
    if (!token || decision === 'INVALID') return { kind: 'REJECTED' };
    if (decision === 'REUSE') {
      return { kind: 'REJECTED', revokeFamilyId: token.familyId };
    }

    const user = await this.users.findShape(token.userId, tx);
    if (!user?.active) {
      return { kind: 'REJECTED', revokeFamilyId: token.familyId };
    }

    const refreshToken = await this.issueRefresh(
      user.id,
      token.familyId,
      tx,
      decision === 'ROTATE' ? token.id : undefined,
    );
    return {
      kind: 'ISSUED',
      pair: {
        accessToken: this.signAccess(user, token.familyId),
        refreshToken,
      },
    };
  }

  private async issueRefresh(
    userId: string,
    familyId: string,
    tx?: Tx,
    replaces?: string,
  ): Promise<string> {
    const now = this.clock.now();
    const token = randomBytes(32).toString('base64url');
    const created = await this.tokens.create(
      {
        userId,
        familyId,
        tokenHash: hashRefreshToken(token),
        expiresAt: refreshExpiry(now),
        createdAt: now,
      },
      tx,
    );
    if (replaces && tx)
      await this.tokens.linkReplacement(replaces, created.id, tx);
    return token;
  }

  private signAccess(user: UserShapeRow, familyId: string): string {
    const payload: JwtPayload = {
      sub: user.id,
      roleId: user.role.id,
      permissions: rolePermissions(user.role),
      sid: familyId,
    };
    return this.jwt.sign(payload, { expiresIn: ACCESS_TOKEN_TTL_SECONDS });
  }
}
