import { createHash } from 'node:crypto';
import {
  LOGIN_FAILURE_WINDOW_MINUTES,
  LOGIN_MAX_FAILURES,
  REFRESH_GRACE_SECONDS,
  REFRESH_TOKEN_TTL_DAYS,
} from '@prime-crm/shared';

/** The state of a presented refresh token, as the rotation rules see it. */
export interface RefreshTokenState {
  expiresAt: Date;
  usedAt: Date | null;
  revokedAt: Date | null;
}

/**
 * What to do with a presented refresh token:
 * - `INVALID` unknown, revoked or expired → 401;
 * - `ROTATE`  first use → mark used, issue the next token in the family;
 * - `GRACE`   used ≤ 30 s ago (two tabs refreshing at once) → issue another pair in the family;
 * - `REUSE`   used longer ago → token theft is assumed: revoke the family, 401.
 */
export type RefreshDecision = 'INVALID' | 'ROTATE' | 'GRACE' | 'REUSE';

export function decideRefresh(
  token: RefreshTokenState | null,
  now: Date,
): RefreshDecision {
  if (!token || token.revokedAt) return 'INVALID';
  if (token.expiresAt.getTime() <= now.getTime()) return 'INVALID';
  if (!token.usedAt) return 'ROTATE';
  const sinceUse = now.getTime() - token.usedAt.getTime();
  return sinceUse <= REFRESH_GRACE_SECONDS * 1000 ? 'GRACE' : 'REUSE';
}

/** Refresh tokens are 256-bit random, so a plain SHA-256 is a safe at-rest hash. */
export function hashRefreshToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

export function refreshExpiry(now: Date): Date {
  return new Date(now.getTime() + REFRESH_TOKEN_TTL_DAYS * 24 * 3_600_000);
}

/** Failures newer than this instant count toward the sign-in limit. */
export function loginWindowStart(now: Date): Date {
  return new Date(now.getTime() - LOGIN_FAILURE_WINDOW_MINUTES * 60_000);
}

/** True when `failures` inside the window already reach the limit: the next attempt gets 429. */
export function isLoginLocked(failures: number): boolean {
  return failures >= LOGIN_MAX_FAILURES;
}
