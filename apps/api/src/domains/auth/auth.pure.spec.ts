import {
  decideRefresh,
  hashRefreshToken,
  isLoginLocked,
  loginWindowStart,
  refreshExpiry,
} from './auth.pure';

const NOW = new Date('2026-10-22T12:00:00.000Z');
const at = (ms: number) => new Date(NOW.getTime() + ms);
const live = { expiresAt: at(86_400_000), usedAt: null, revokedAt: null };

describe('decideRefresh', () => {
  it('unknown token → INVALID', () => {
    expect(decideRefresh(null, NOW)).toBe('INVALID');
  });

  it('revoked token → INVALID', () => {
    expect(decideRefresh({ ...live, revokedAt: at(-1) }, NOW)).toBe('INVALID');
  });

  it('expired token (exactly at expiry) → INVALID', () => {
    expect(decideRefresh({ ...live, expiresAt: NOW }, NOW)).toBe('INVALID');
  });

  it('never used → ROTATE', () => {
    expect(decideRefresh(live, NOW)).toBe('ROTATE');
  });

  it('Two refreshes with the same token within 30 s → both succeed (second is GRACE, inclusive at 30 s)', () => {
    expect(decideRefresh({ ...live, usedAt: at(-1) }, NOW)).toBe('GRACE');
    expect(decideRefresh({ ...live, usedAt: at(-30_000) }, NOW)).toBe('GRACE');
  });

  it('Refresh rotates: old token reused after the grace window → REUSE', () => {
    expect(decideRefresh({ ...live, usedAt: at(-30_001) }, NOW)).toBe('REUSE');
  });

  it('a revoked family wins over the grace window', () => {
    expect(
      decideRefresh({ ...live, usedAt: at(-1), revokedAt: at(-1) }, NOW),
    ).toBe('INVALID');
  });
});

describe('login rate limit', () => {
  it('11th failed attempt within 15 min → 429 (locked once 10 failures are in the window)', () => {
    expect(isLoginLocked(9)).toBe(false);
    expect(isLoginLocked(10)).toBe(true);
  });

  it('the window starts 15 minutes back', () => {
    expect(loginWindowStart(NOW)).toEqual(at(-15 * 60_000));
  });
});

describe('refresh token helpers', () => {
  it('hash is deterministic and not the token', () => {
    expect(hashRefreshToken('abc')).toBe(hashRefreshToken('abc'));
    expect(hashRefreshToken('abc')).not.toContain('abc');
    expect(hashRefreshToken('abc')).toHaveLength(64);
  });

  it('expires 30 days after issue', () => {
    expect(refreshExpiry(NOW)).toEqual(at(30 * 86_400_000));
  });
});
