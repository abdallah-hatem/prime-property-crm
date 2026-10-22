import {
  BadRequestException,
  HttpException,
  UnauthorizedException,
} from '@nestjs/common';
import { hashPassword } from '../../common/utils/password.util';
import { AuthService } from './auth.service';

const NOW = new Date('2026-10-22T12:00:00.000Z');
const PASSWORD = 'correct-horse-battery';
let HASH: string;

beforeAll(async () => {
  HASH = await hashPassword(PASSWORD);
});

const userRow = (fields: Record<string, unknown> = {}) => ({
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
    permissions: ['owners.assign'],
  },
  passwordHash: HASH,
  ...fields,
});

type Mocks = Record<string, Record<string, jest.Mock>>;

async function makeService(overrides: Mocks = {}) {
  const users = {
    findForLogin: jest.fn().mockResolvedValue(userRow()),
    findShape: jest.fn().mockResolvedValue(userRow()),
    findPasswordHash: jest.fn().mockResolvedValue(HASH),
    updateProfile: jest.fn().mockResolvedValue(userRow()),
    updatePasswordHash: jest.fn().mockResolvedValue(undefined),
    ...overrides.users,
  };
  const attempts = {
    countSince: jest.fn().mockResolvedValue(0),
    record: jest.fn().mockResolvedValue(undefined),
    deleteOlderThan: jest.fn().mockResolvedValue(undefined),
    clear: jest.fn().mockResolvedValue(undefined),
    ...overrides.attempts,
  };
  const sessions = {
    start: jest.fn().mockResolvedValue({ accessToken: 'a', refreshToken: 'r' }),
    revokeAllSessions: jest.fn().mockResolvedValue(1),
    ...overrides.sessions,
  };
  const tx = { tx: true };
  const db = {
    transaction: jest.fn((work: (t: unknown) => unknown) => work(tx)),
  };
  const clock = { now: jest.fn(() => NOW) };
  const svc = new AuthService(
    db as never,
    users as never,
    attempts as never,
    sessions as never,
    clock,
  );
  await svc.onModuleInit();
  return { svc, users, attempts, sessions, tx };
}

const login = (email = 'sara@prime.test', password = PASSWORD) => ({
  email,
  password,
});

async function rejection(promise: Promise<unknown>): Promise<HttpException> {
  try {
    await promise;
  } catch (e) {
    return e as HttpException;
  }
  throw new Error('expected a rejection');
}

describe('AuthService.login', () => {
  it('Correct email + password → tokens and Me with permissions', async () => {
    const { svc, attempts } = await makeService();
    const res = await svc.login(login());
    expect(res).toMatchObject({
      accessToken: 'a',
      refreshToken: 'r',
      user: {
        id: 'user-1',
        permissions: ['owners.assign'],
        role: { id: 'role-1', name: 'Team member' },
      },
    });
    expect(res.user).not.toHaveProperty('passwordHash');
    expect(attempts.clear).toHaveBeenCalledWith('sara@prime.test');
  });

  it('Wrong password, unknown email, deactivated user → identical 401 INVALID_CREDENTIALS', async () => {
    const cases = [
      await makeService(),
      await makeService({
        users: { findForLogin: jest.fn().mockResolvedValue(null) },
      }),
      await makeService({
        users: {
          findForLogin: jest.fn().mockResolvedValue(userRow({ active: false })),
        },
      }),
    ];
    const passwords = ['wrong-password', PASSWORD, PASSWORD];
    const bodies = [];
    for (const [i, { svc, attempts, sessions }] of cases.entries()) {
      const err = await rejection(svc.login(login(undefined, passwords[i])));
      expect(err).toBeInstanceOf(UnauthorizedException);
      bodies.push(err.getResponse());
      expect(attempts.record).toHaveBeenCalledWith('sara@prime.test', NOW);
      expect(sessions.start).not.toHaveBeenCalled();
    }
    expect(bodies[0]).toEqual({
      message: 'Email or password is incorrect',
      error: 'INVALID_CREDENTIALS',
    });
    expect(bodies[1]).toEqual(bodies[0]);
    expect(bodies[2]).toEqual(bodies[0]);
  });

  it('11th failed attempt within 15 min → 429', async () => {
    const { svc, users } = await makeService({
      attempts: { countSince: jest.fn().mockResolvedValue(10) },
    });
    const err = await rejection(svc.login(login()));
    expect(err.getStatus()).toBe(429);
    expect(users.findForLogin).not.toHaveBeenCalled();
  });
});

describe('AuthService.changePassword', () => {
  it('Change password with wrong current → 400 WRONG_PASSWORD', async () => {
    const { svc, users, sessions } = await makeService();
    const err = await rejection(
      svc.changePassword('user-1', {
        currentPassword: 'nope-nope',
        newPassword: 'new-password-1',
      }),
    );
    expect(err).toBeInstanceOf(BadRequestException);
    expect(err.getResponse()).toMatchObject({ error: 'WRONG_PASSWORD' });
    expect(users.updatePasswordHash).not.toHaveBeenCalled();
    expect(sessions.revokeAllSessions).not.toHaveBeenCalled();
  });

  it('saves the new hash and revokes the other sessions in one transaction', async () => {
    const { svc, users, sessions, tx } = await makeService();
    await svc.changePassword(
      'user-1',
      { currentPassword: PASSWORD, newPassword: 'new-password-1' },
      'fam-1',
    );
    expect(users.updatePasswordHash).toHaveBeenCalledWith(
      'user-1',
      expect.stringMatching(/^scrypt\$/),
      tx,
    );
    expect(sessions.revokeAllSessions).toHaveBeenCalledWith(
      tx,
      'user-1',
      'fam-1',
    );
  });
});

describe('AuthService.updateMe', () => {
  it('normalises the phone and clears it with null', async () => {
    const { svc, users } = await makeService();
    await svc.updateMe('user-1', { phone: '0100 123 4567' });
    expect(users.updateProfile).toHaveBeenLastCalledWith('user-1', {
      name: undefined,
      language: undefined,
      phone: '+201001234567',
    });
    await svc.updateMe('user-1', { phone: null });
    expect(users.updateProfile).toHaveBeenLastCalledWith('user-1', {
      name: undefined,
      language: undefined,
      phone: null,
    });
  });
});

describe('AuthService.me', () => {
  it('a deactivated user → 401', async () => {
    const { svc } = await makeService({
      users: {
        findShape: jest.fn().mockResolvedValue(userRow({ active: false })),
      },
    });
    await expect(svc.me('user-1')).rejects.toThrow(UnauthorizedException);
  });
});
