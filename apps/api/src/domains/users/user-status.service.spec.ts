import { BadRequestException, ConflictException } from '@nestjs/common';
import type { UserShapeRow } from '../../common/utils/user-shape.util';
import { UserStatusService } from './user-status.service';

const tx = { tx: true };
const NOW = new Date('2026-10-23T09:00:00Z');
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
  overrides: {
    users?: Mocks;
    directory?: Mocks;
    lastAdmin?: Mocks;
    assignment?: Mocks;
    sessions?: Mocks;
  } = {},
) {
  const calls: string[] = [];
  const track =
    (name: string, value: unknown) =>
    (..._args: unknown[]) => {
      calls.push(name);
      return Promise.resolve(value);
    };
  const db = {
    transaction: jest.fn((work: (t: unknown) => unknown) => work(tx)),
  };
  const users = {
    findShape: jest.fn().mockResolvedValue(shape()),
    ...overrides.users,
  };
  const status = {
    lockUser: jest.fn(track('lock', undefined)) as jest.Mock<Promise<void>>,
    assignedWork: jest
      .fn()
      .mockResolvedValue({ ownerIds: ['o1', 'o2'], listingIds: ['l1'] }),
    setActive: jest.fn(
      (_t: unknown, _id: string, active: boolean) =>
        Promise.resolve(shape({ active })) as never,
    ),
  };
  const directory = {
    findActive: jest.fn().mockResolvedValue({ id: 'u2', name: 'Omar' }),
    ...overrides.directory,
  };
  const lastAdmin = {
    assertNotLastActiveAdmin: jest.fn(track('lastAdmin', undefined)),
    ...overrides.lastAdmin,
  };
  const assignment = {
    reassignOwnerAndListing: jest.fn(
      track('reassign', {
        ownerIds: ['o1', 'o2', 'o3'],
        listingIds: ['l1'],
        remindersMoved: 4,
      }),
    ),
    ...overrides.assignment,
  };
  const sessions = {
    revokeAllSessions: jest.fn(track('revoke', 2)),
    ...overrides.sessions,
  };
  const activity = { record: jest.fn().mockResolvedValue(undefined) };
  const clock = { now: () => NOW };
  const svc = new UserStatusService(
    db as never,
    users as never,
    status,
    directory as never,
    lastAdmin as never,
    assignment as never,
    sessions as never,
    activity as never,
    clock,
  );
  return {
    svc,
    calls,
    users,
    status,
    directory,
    lastAdmin,
    assignment,
    sessions,
    activity,
  };
}

describe('UserStatusService.deactivate', () => {
  it('hands owners, listings and reminders over in one transaction, ends sessions, logs counts', async () => {
    const m = makeService();
    const user = await m.svc.deactivate('u1', 'u2', 'admin');

    expect(user.active).toBe(false);
    expect(m.calls).toEqual(['lock', 'lastAdmin', 'reassign', 'revoke']);
    expect(m.status.lockUser).toHaveBeenCalledWith(tx, 'u1');
    expect(m.lastAdmin.assertNotLastActiveAdmin).toHaveBeenCalledWith(tx, 'u1');
    expect(m.directory.findActive).toHaveBeenCalledWith('u2', tx);
    expect(m.assignment.reassignOwnerAndListing).toHaveBeenCalledWith(
      tx,
      { ownerIds: ['o1', 'o2'], listingIds: ['l1'] },
      'u2',
      'admin',
    );
    expect(m.status.setActive).toHaveBeenCalledWith(tx, 'u1', false, NOW);
    expect(m.activity.record).toHaveBeenCalledWith(tx, {
      type: 'USER_DEACTIVATE',
      actorId: 'admin',
      summary: 'Deactivated Sara; work handed to Omar',
      target: { kind: 'USER', id: 'u1', label: 'Sara' },
      details: {
        handOverTo: { id: 'u2', name: 'Omar' },
        owners: 3,
        listings: 1,
        reminders: 4,
        sessionsEnded: 2,
      },
    });
  });

  it('handOverTo null → work goes unassigned without a recipient lookup', async () => {
    const m = makeService();
    await m.svc.deactivate('u1', null, 'admin');
    expect(m.directory.findActive).not.toHaveBeenCalled();
    expect(m.assignment.reassignOwnerAndListing).toHaveBeenCalledWith(
      tx,
      expect.anything(),
      null,
      'admin',
    );
    expect(m.activity.record.mock.calls[0][1].details.handOverTo).toBeNull();
  });

  it('self → 400 SELF_DEACTIVATE before any transaction', async () => {
    const m = makeService();
    await expect(
      m.svc.deactivate('admin', null, 'admin'),
    ).rejects.toMatchObject({ response: { error: 'SELF_DEACTIVATE' } });
    expect(m.users.findShape).not.toHaveBeenCalled();
  });

  it('handOverTo the same user, or an inactive/unknown one → 400 INVALID_HANDOVER, nothing moved', async () => {
    const same = makeService();
    await expect(same.svc.deactivate('u1', 'u1', 'admin')).rejects.toThrow(
      BadRequestException,
    );

    const inactive = makeService({
      directory: { findActive: jest.fn().mockResolvedValue(null) },
    });
    await expect(
      inactive.svc.deactivate('u1', 'u9', 'admin'),
    ).rejects.toMatchObject({ response: { error: 'INVALID_HANDOVER' } });
    expect(inactive.assignment.reassignOwnerAndListing).not.toHaveBeenCalled();
    expect(inactive.status.setActive).not.toHaveBeenCalled();
  });

  it('last active admin → the 409 from LastAdminService, nothing moved', async () => {
    const m = makeService({
      lastAdmin: {
        assertNotLastActiveAdmin: jest
          .fn()
          .mockRejectedValue(new ConflictException({ error: 'LAST_ADMIN' })),
      },
    });
    await expect(m.svc.deactivate('u1', null, 'admin')).rejects.toThrow(
      ConflictException,
    );
    expect(m.assignment.reassignOwnerAndListing).not.toHaveBeenCalled();
    expect(m.activity.record).not.toHaveBeenCalled();
  });

  it('unknown user → 404', async () => {
    const m = makeService({
      users: { findShape: jest.fn().mockResolvedValue(null) },
    });
    await expect(m.svc.deactivate('u1', null, 'admin')).rejects.toMatchObject({
      status: 404,
    });
  });

  it('already deactivated → returned unchanged, nothing moved or logged', async () => {
    const m = makeService({
      users: {
        findShape: jest.fn().mockResolvedValue(shape({ active: false })),
      },
    });
    const user = await m.svc.deactivate('u1', 'u2', 'admin');
    expect(user.active).toBe(false);
    expect(m.assignment.reassignOwnerAndListing).not.toHaveBeenCalled();
    expect(m.activity.record).not.toHaveBeenCalled();
  });

  it('a failing step propagates (the transaction rolls back) and nothing is logged', async () => {
    const m = makeService({
      sessions: {
        revokeAllSessions: jest.fn().mockRejectedValue(new Error('boom')),
      },
    });
    await expect(m.svc.deactivate('u1', 'u2', 'admin')).rejects.toThrow('boom');
    expect(m.status.setActive).not.toHaveBeenCalled();
    expect(m.activity.record).not.toHaveBeenCalled();
  });
});

describe('UserStatusService.reactivate', () => {
  it('reactivates and logs USER_REACTIVATE; moves nothing back', async () => {
    const m = makeService({
      users: {
        findShape: jest.fn().mockResolvedValue(shape({ active: false })),
      },
    });
    const user = await m.svc.reactivate('u1', 'admin');
    expect(user.active).toBe(true);
    expect(m.status.setActive).toHaveBeenCalledWith(tx, 'u1', true, NOW);
    expect(m.assignment.reassignOwnerAndListing).not.toHaveBeenCalled();
    expect(m.activity.record).toHaveBeenCalledWith(tx, {
      type: 'USER_REACTIVATE',
      actorId: 'admin',
      summary: 'Reactivated Sara',
      target: { kind: 'USER', id: 'u1', label: 'Sara' },
    });
  });

  it('an active user → unchanged, nothing logged', async () => {
    const m = makeService();
    await m.svc.reactivate('u1', 'admin');
    expect(m.status.setActive).not.toHaveBeenCalled();
    expect(m.activity.record).not.toHaveBeenCalled();
  });
});
