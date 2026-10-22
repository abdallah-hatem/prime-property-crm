import { ConflictException } from '@nestjs/common';
import type { Tx } from '../../common/interfaces/transaction.interface';
import { LastAdminService } from './last-admin.service';

const tx = {} as Tx;

function makeService(
  overrides: {
    users?: Record<string, jest.Mock>;
    adminId?: string | null;
  } = {},
) {
  const calls: string[] = [];
  const users = {
    lockAdminRole: jest.fn(() => {
      calls.push('lock');
      return Promise.resolve();
    }),
    findRoleAndActive: jest.fn(() => {
      calls.push('read');
      return Promise.resolve({ roleId: 'admin-role', active: true });
    }),
    countActiveOnRole: jest.fn(() => {
      calls.push('count');
      return Promise.resolve(1);
    }),
    ...overrides.users,
  };
  const adminRole = {
    adminId: jest
      .fn()
      .mockResolvedValue(
        overrides.adminId === undefined ? 'admin-role' : overrides.adminId,
      ),
  };
  const svc = new LastAdminService(users as never, adminRole as never);
  return { svc, users, calls };
}

describe('LastAdminService.assertNotLastActiveAdmin', () => {
  it('passes when another active admin exists, after locking first', async () => {
    const { svc, calls, users } = makeService();
    await expect(
      svc.assertNotLastActiveAdmin(tx, 'u1'),
    ).resolves.toBeUndefined();
    expect(calls).toEqual(['lock', 'read', 'count']);
    expect(users.lockAdminRole).toHaveBeenCalledWith('admin-role', tx);
    expect(users.countActiveOnRole).toHaveBeenCalledWith(
      'admin-role',
      'u1',
      tx,
    );
  });

  it('Moving the last active admin to another role → 409 LAST_ADMIN', async () => {
    const { svc } = makeService({
      users: { countActiveOnRole: jest.fn().mockResolvedValue(0) },
    });
    const error = await svc.assertNotLastActiveAdmin(tx, 'u1').catch((e) => e);
    expect(error).toBeInstanceOf(ConflictException);
    expect(error.getResponse()).toMatchObject({ error: 'LAST_ADMIN' });
  });

  it('passes for a user who is not an admin, or not active', async () => {
    for (const row of [
      { roleId: 'member-role', active: true },
      { roleId: 'admin-role', active: false },
      null,
    ]) {
      const count = jest.fn().mockResolvedValue(0);
      const { svc } = makeService({
        users: {
          findRoleAndActive: jest.fn().mockResolvedValue(row),
          countActiveOnRole: count,
        },
      });
      await expect(
        svc.assertNotLastActiveAdmin(tx, 'u1'),
      ).resolves.toBeUndefined();
      expect(count).not.toHaveBeenCalled();
    }
  });

  it('does nothing when no Admin role exists yet', async () => {
    const { svc, users } = makeService({ adminId: null });
    await svc.assertNotLastActiveAdmin(tx, 'u1');
    expect(users.lockAdminRole).not.toHaveBeenCalled();
  });
});
