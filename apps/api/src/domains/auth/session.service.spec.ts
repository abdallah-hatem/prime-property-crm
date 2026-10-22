import { UnauthorizedException } from '@nestjs/common';
import { SessionService } from './session.service';

const NOW = new Date('2026-10-22T12:00:00.000Z');
const at = (ms: number) => new Date(NOW.getTime() + ms);

const USER = {
  id: 'user-1',
  name: 'Sara',
  email: 'sara@prime.test',
  phone: null,
  language: 'en',
  active: true,
  createdAt: NOW,
  role: {
    id: 'role-1',
    name: 'Team member',
    builtIn: 'TEAM_MEMBER',
    permissions: [],
  },
};

const TOKEN = {
  id: 'rt-1',
  userId: 'user-1',
  familyId: 'fam-1',
  expiresAt: at(86_400_000),
  usedAt: null as Date | null,
  revokedAt: null as Date | null,
};

type Mocks = Record<string, Record<string, jest.Mock>>;

function makeService(overrides: Mocks = {}) {
  const tx = { tx: true };
  const tokens = {
    create: jest.fn().mockResolvedValue({ id: 'rt-new' }),
    findByHash: jest.fn().mockResolvedValue(TOKEN),
    claim: jest.fn().mockResolvedValue(true),
    linkReplacement: jest.fn().mockResolvedValue(undefined),
    revokeFamily: jest.fn().mockResolvedValue(undefined),
    revokeAllForUser: jest.fn().mockResolvedValue(2),
    ...overrides.tokens,
  };
  const users = {
    findShape: jest.fn().mockResolvedValue(USER),
    ...overrides.users,
  };
  const db = {
    transaction: jest.fn((work: (t: unknown) => unknown) => work(tx)),
  };
  const jwt = { sign: jest.fn().mockReturnValue('access-token') };
  const clock = { now: jest.fn(() => NOW) };
  const svc = new SessionService(
    db as never,
    tokens as never,
    users as never,
    jwt as never,
    clock,
  );
  return { svc, tokens, users, jwt, tx };
}

describe('SessionService.refresh', () => {
  it('Refresh rotates: first use marks the token used and links its replacement', async () => {
    const { svc, tokens, jwt } = makeService();
    const pair = await svc.refresh('presented');
    expect(pair.accessToken).toBe('access-token');
    expect(pair.refreshToken).toMatch(/^[\w-]{43}$/);
    expect(tokens.linkReplacement).toHaveBeenCalledWith(
      'rt-1',
      'rt-new',
      expect.anything(),
    );
    expect(jwt.sign.mock.calls[0][0]).toMatchObject({
      sub: 'user-1',
      sid: 'fam-1',
    });
  });

  it('Two refreshes with the same token within 30 s → both succeed', async () => {
    const { svc, tokens } = makeService({
      tokens: {
        findByHash: jest
          .fn()
          .mockResolvedValue({ ...TOKEN, usedAt: at(-10_000) }),
      },
    });
    await expect(svc.refresh('presented')).resolves.toHaveProperty(
      'refreshToken',
    );
    expect(tokens.claim).not.toHaveBeenCalled();
    expect(tokens.linkReplacement).not.toHaveBeenCalled();
    expect(tokens.create.mock.calls[0][0]).toMatchObject({ familyId: 'fam-1' });
  });

  it('a concurrent refresh that loses the claim falls into the grace window', async () => {
    const findByHash = jest
      .fn()
      .mockResolvedValueOnce(TOKEN)
      .mockResolvedValueOnce({ ...TOKEN, usedAt: NOW });
    const { svc, tokens } = makeService({
      tokens: { findByHash, claim: jest.fn().mockResolvedValue(false) },
    });
    await expect(svc.refresh('presented')).resolves.toHaveProperty(
      'accessToken',
    );
    expect(tokens.linkReplacement).not.toHaveBeenCalled();
  });

  it('Refresh rotates: old token reused after the grace window → 401 and the whole family revoked', async () => {
    const { svc, tokens } = makeService({
      tokens: {
        findByHash: jest
          .fn()
          .mockResolvedValue({ ...TOKEN, usedAt: at(-31_000) }),
      },
    });
    await expect(svc.refresh('presented')).rejects.toThrow(
      UnauthorizedException,
    );
    expect(tokens.revokeFamily).toHaveBeenCalledWith('fam-1', NOW);
    expect(tokens.create).not.toHaveBeenCalled();
  });

  it('unknown token → 401 without revoking anything', async () => {
    const { svc, tokens } = makeService({
      tokens: { findByHash: jest.fn().mockResolvedValue(null) },
    });
    await expect(svc.refresh('presented')).rejects.toThrow(
      UnauthorizedException,
    );
    expect(tokens.revokeFamily).not.toHaveBeenCalled();
  });

  it('deactivated user → 401 and the family revoked', async () => {
    const { svc, tokens } = makeService({
      users: {
        findShape: jest.fn().mockResolvedValue({ ...USER, active: false }),
      },
    });
    await expect(svc.refresh('presented')).rejects.toThrow(
      UnauthorizedException,
    );
    expect(tokens.revokeFamily).toHaveBeenCalledWith('fam-1', NOW);
  });
});

describe('SessionService.revokeAllSessions', () => {
  it('Password reset by admin revokes all refresh tokens (revokeAllSessions)', async () => {
    const { svc, tokens, tx } = makeService();
    await svc.revokeAllSessions(tx as never, 'user-1');
    expect(tokens.revokeAllForUser).toHaveBeenCalledWith(
      'user-1',
      NOW,
      tx,
      undefined,
    );
  });

  it('keeps the caller’s own session when asked', async () => {
    const { svc, tokens, tx } = makeService();
    await svc.revokeAllSessions(tx as never, 'user-1', 'fam-1');
    expect(tokens.revokeAllForUser).toHaveBeenCalledWith(
      'user-1',
      NOW,
      tx,
      'fam-1',
    );
  });
});

describe('SessionService.logout', () => {
  it('revokes the family of the caller’s own token', async () => {
    const { svc, tokens } = makeService();
    await svc.logout('user-1', 'presented');
    expect(tokens.revokeFamily).toHaveBeenCalledWith('fam-1', NOW);
  });

  it('ignores another user’s token', async () => {
    const { svc, tokens } = makeService();
    await svc.logout('user-2', 'presented');
    expect(tokens.revokeFamily).not.toHaveBeenCalled();
  });
});
