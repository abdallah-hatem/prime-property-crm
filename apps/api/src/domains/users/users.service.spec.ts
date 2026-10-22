import {
  BadRequestException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import type { UserShapeRow } from '../../common/utils/user-shape.util';
import { UsersService } from './users.service';

const tx = { tx: true };
const shape = (fields: Partial<UserShapeRow> = {}): UserShapeRow => ({
  id: 'u1',
  name: 'Sara',
  email: 'sara@prime.test',
  phone: null,
  language: 'en',
  active: true,
  createdAt: new Date('2026-10-01T00:00:00Z'),
  role: {
    id: 'r-member',
    name: 'Team member',
    builtIn: 'TEAM_MEMBER',
    permissions: [],
  },
  ...fields,
});

type Mocks = Record<string, jest.Mock>;
function makeService(
  overrides: { users?: Mocks; roles?: Mocks; lastAdmin?: Mocks } = {},
) {
  const db = {
    transaction: jest.fn((work: (t: unknown) => unknown) => work(tx)),
  };
  const users = {
    findShape: jest.fn().mockResolvedValue(shape()),
    findIdByEmail: jest.fn().mockResolvedValue(null),
    create: jest.fn().mockResolvedValue(shape({ id: 'new' })),
    update: jest.fn().mockResolvedValue(shape({ name: 'Updated' })),
    updatePasswordHash: jest.fn().mockResolvedValue(undefined),
    ...overrides.users,
  };
  const roles = {
    findById: jest.fn().mockResolvedValue({ id: 'r-admin' }),
    ...overrides.roles,
  };
  const lastAdmin = {
    assertNotLastActiveAdmin: jest.fn().mockResolvedValue(undefined),
    ...overrides.lastAdmin,
  };
  const sessions = { revokeAllSessions: jest.fn().mockResolvedValue(2) };
  const activity = { record: jest.fn().mockResolvedValue(undefined) };
  const svc = new UsersService(
    db as never,
    users as never,
    roles as never,
    lastAdmin as never,
    sessions as never,
    activity as never,
  );
  return { svc, users, roles, lastAdmin, sessions, activity };
}

const createDto = {
  name: 'Omar',
  email: 'omar@prime.test',
  phone: '0100 123 4567',
  roleId: 'r-member',
  language: 'ar' as const,
  password: 'long-enough-1',
};

describe('UsersService', () => {
  it('create hashes the password, stores the phone as E.164 and logs USER_CREATE', async () => {
    const { svc, users, activity } = makeService();
    await svc.create(createDto, 'actor');
    const [data, usedTx] = users.create.mock.calls[0] as unknown as [
      Record<string, unknown>,
      unknown,
    ];
    expect(usedTx).toBe(tx);
    expect(data.phone).toBe('+201001234567');
    expect(data.passwordHash).toMatch(/^scrypt\$/);
    expect(data).not.toHaveProperty('password');
    expect(activity.record).toHaveBeenCalledWith(
      tx,
      expect.objectContaining({ type: 'USER_CREATE', actorId: 'actor' }),
    );
  });

  it('Create user with an existing email (different case) → 409 EMAIL_TAKEN', async () => {
    const { svc, users } = makeService({
      users: { findIdByEmail: jest.fn().mockResolvedValue('someone') },
    });
    const error = await svc.create(createDto, 'actor').catch((e) => e);
    expect(error).toBeInstanceOf(ConflictException);
    expect(error.getResponse()).toMatchObject({ error: 'EMAIL_TAKEN' });
    expect(users.create).not.toHaveBeenCalled();
  });

  it('a unique violation from a concurrent create also answers EMAIL_TAKEN', async () => {
    const unique = Object.assign(new Error('dup'), {
      name: 'PrismaClientKnownRequestError',
      code: 'P2002',
    });
    const { svc } = makeService({
      users: { create: jest.fn().mockRejectedValue(unique) },
    });
    const error = await svc.create(createDto, 'actor').catch((e) => e);
    expect(error.getResponse()).toMatchObject({ error: 'EMAIL_TAKEN' });
  });

  it('create with an unknown role → 400 INVALID_ROLE', async () => {
    const { svc } = makeService({
      roles: { findById: jest.fn().mockResolvedValue(null) },
    });
    const error = await svc.create(createDto, 'actor').catch((e) => e);
    expect(error).toBeInstanceOf(BadRequestException);
    expect(error.getResponse()).toMatchObject({ error: 'INVALID_ROLE' });
  });

  it('update checks the last admin only when the role changes', async () => {
    const { svc, lastAdmin } = makeService();
    await svc.update('u1', { name: 'سارة' }, 'actor');
    expect(lastAdmin.assertNotLastActiveAdmin).not.toHaveBeenCalled();
    await svc.update('u1', { roleId: 'r-admin' }, 'actor');
    expect(lastAdmin.assertNotLastActiveAdmin).toHaveBeenCalledWith(tx, 'u1');
  });

  it('update refused by the last-admin check writes nothing', async () => {
    const { svc, users, activity } = makeService({
      lastAdmin: {
        assertNotLastActiveAdmin: jest
          .fn()
          .mockRejectedValue(new ConflictException({ error: 'LAST_ADMIN' })),
      },
    });
    await expect(svc.update('u1', { roleId: 'r-other' }, 'a')).rejects.toThrow(
      ConflictException,
    );
    expect(users.update).not.toHaveBeenCalled();
    expect(activity.record).not.toHaveBeenCalled();
  });

  it('update to the email the user already has is not a conflict', async () => {
    const { svc, users } = makeService({
      users: { findIdByEmail: jest.fn().mockResolvedValue('u1') },
    });
    await svc.update('u1', { email: 'new@prime.test' }, 'actor');
    expect(users.update).toHaveBeenCalled();
  });

  it('update with nothing changed writes and logs nothing', async () => {
    const { svc, users, activity } = makeService();
    await svc.update('u1', { name: 'Sara', language: 'en' }, 'actor');
    expect(users.update).not.toHaveBeenCalled();
    expect(activity.record).not.toHaveBeenCalled();
  });

  it('reset password revokes every session in the same tx and logs PASSWORD_RESET', async () => {
    const { svc, users, sessions, activity } = makeService();
    await svc.resetPassword('u1', 'brand-new-pass', 'actor');
    expect(users.updatePasswordHash).toHaveBeenCalledWith(
      'u1',
      expect.stringMatching(/^scrypt\$/),
      tx,
    );
    expect(sessions.revokeAllSessions).toHaveBeenCalledWith(tx, 'u1');
    expect(activity.record).toHaveBeenCalledWith(
      tx,
      expect.objectContaining({
        type: 'PASSWORD_RESET',
        details: { sessionsEnded: 2 },
      }),
    );
  });

  it('unknown user → 404 on read, update and reset', async () => {
    const { svc } = makeService({
      users: { findShape: jest.fn().mockResolvedValue(null) },
    });
    await expect(svc.findOne('x')).rejects.toThrow(NotFoundException);
    await expect(svc.update('x', { name: 'y' }, 'a')).rejects.toThrow(
      NotFoundException,
    );
    await expect(svc.resetPassword('x', 'long-enough', 'a')).rejects.toThrow(
      NotFoundException,
    );
  });
});
