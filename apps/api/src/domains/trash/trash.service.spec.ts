import {
  ConflictException,
  GoneException,
  NotFoundException,
} from '@nestjs/common';
import type { CurrentUser } from '../../common/interfaces/current-user.interface';
import type { TrashedRecord } from './interfaces/trash.interface';
import { TrashRestoreRegistry } from './trash-restore.registry';
import { TrashService } from './trash.service';

const NOW = new Date('2026-10-22T09:00:00.000Z');
const DAY = 24 * 3_600_000;
const actor: CurrentUser = {
  id: 'admin-1',
  roleId: 'role-admin',
  permissions: [],
  isAdmin: true,
};
const TX = { tx: true };

const trashed = (deletedAt: Date): TrashedRecord => ({
  kind: 'OWNER',
  id: 'owner-1',
  label: 'Ahmed Ali',
  deletedAt,
  deletedBy: { id: 'admin-1', name: 'Admin' },
});

type Overrides = Partial<
  Record<'trash' | 'activity', Record<string, jest.Mock>>
>;

function makeService(overrides: Overrides = {}) {
  const calls: string[] = [];
  const trash = {
    findLive: jest.fn().mockResolvedValue(null),
    findDeleted: jest
      .fn()
      .mockResolvedValue(trashed(new Date(NOW.getTime() - DAY))),
    markDeleted: jest.fn().mockResolvedValue(true),
    clearDeleted: jest.fn().mockImplementation(() => {
      calls.push('clear');
      return Promise.resolve(true);
    }),
    list: jest.fn(),
    ...overrides.trash,
  };
  const activity = {
    record: jest.fn().mockImplementation(() => {
      calls.push('activity');
      return Promise.resolve();
    }),
    hasEntryFor: jest.fn().mockResolvedValue(false),
    ...overrides.activity,
  };
  const db = {
    transaction: jest.fn((work: (tx: unknown) => Promise<unknown>) => work(TX)),
  };
  const registry = new TrashRestoreRegistry();
  const clock = { now: () => NOW };
  const svc = new TrashService(
    db as never,
    trash as never,
    registry,
    activity as never,
    clock,
  );
  return { svc, trash, activity, registry, calls };
}

describe('TrashService.restore', () => {
  it("Restore an item that isn't in the trash → 404", async () => {
    const { svc } = makeService({
      trash: {
        findDeleted: jest.fn().mockResolvedValue(null),
        findLive: jest.fn().mockResolvedValue(trashed(NOW)),
      },
    });
    await expect(svc.restore('OWNER', 'owner-1', actor)).rejects.toThrow(
      NotFoundException,
    );
  });

  it('an id that never existed → 404', async () => {
    const { svc } = makeService({
      trash: { findDeleted: jest.fn().mockResolvedValue(null) },
    });
    await expect(svc.restore('OWNER', 'nope', actor)).rejects.toThrow(
      NotFoundException,
    );
  });

  it('Restore after purgeAt → 410 PURGED', async () => {
    const deletedAt = new Date(NOW.getTime() - 31 * DAY);
    const { svc, trash } = makeService({
      trash: { findDeleted: jest.fn().mockResolvedValue(trashed(deletedAt)) },
    });
    await expect(svc.restore('OWNER', 'owner-1', actor)).rejects.toThrow(
      GoneException,
    );
    expect(trash.clearDeleted).not.toHaveBeenCalled();
  });

  it('a row the purge cron already removed (DELETE logged, row gone) → 410 PURGED', async () => {
    const { svc } = makeService({
      trash: { findDeleted: jest.fn().mockResolvedValue(null) },
      activity: { hasEntryFor: jest.fn().mockResolvedValue(true) },
    });
    await expect(svc.restore('OWNER', 'owner-1', actor)).rejects.toThrow(
      GoneException,
    );
  });

  it('Item deleted exactly 30 days ago is still restorable; 30 days + 1 minute is not', async () => {
    const exactly = new Date(NOW.getTime() - 30 * DAY);
    const ok = makeService({
      trash: { findDeleted: jest.fn().mockResolvedValue(trashed(exactly)) },
    });
    await expect(ok.svc.restore('OWNER', 'owner-1', actor)).resolves.toBe(
      undefined,
    );

    const late = makeService({
      trash: {
        findDeleted: jest
          .fn()
          .mockResolvedValue(trashed(new Date(exactly.getTime() - 60_000))),
      },
    });
    await expect(late.svc.restore('OWNER', 'owner-1', actor)).rejects.toThrow(
      GoneException,
    );
  });

  it('runs the kind handler around the restore and logs RESTORE last', async () => {
    const { svc, registry, calls, activity } = makeService();
    registry.register('OWNER', {
      validate: () => {
        calls.push('validate');
        return Promise.resolve();
      },
      afterRestore: () => {
        calls.push('after');
        return Promise.resolve();
      },
    });
    await svc.restore('OWNER', 'owner-1', actor);
    expect(calls).toEqual(['validate', 'clear', 'after', 'activity']);
    expect(activity.record).toHaveBeenCalledWith(
      TX,
      expect.objectContaining({
        type: 'RESTORE',
        actorId: 'admin-1',
        target: { kind: 'OWNER', id: 'owner-1', label: 'Ahmed Ali' },
      }),
    );
  });

  it('a handler refusal (domain 409) restores nothing', async () => {
    const { svc, registry, trash, activity } = makeService();
    registry.register('OWNER', {
      validate: () =>
        Promise.reject(
          new ConflictException({ error: 'OWNER_ALREADY_LISTED' }),
        ),
    });
    await expect(svc.restore('OWNER', 'owner-1', actor)).rejects.toThrow(
      ConflictException,
    );
    expect(trash.clearDeleted).not.toHaveBeenCalled();
    expect(activity.record).not.toHaveBeenCalled();
  });

  it('a concurrent restore that got there first → 404', async () => {
    const { svc } = makeService({
      trash: { clearDeleted: jest.fn().mockResolvedValue(false) },
    });
    await expect(svc.restore('OWNER', 'owner-1', actor)).rejects.toThrow(
      NotFoundException,
    );
  });
});

describe('TrashService.softDelete', () => {
  it('Trash core computes purgeAt = deletedAt + 30 days, and logs DELETE in the same tx', async () => {
    const { svc, activity } = makeService({
      trash: { findLive: jest.fn().mockResolvedValue(trashed(NOW)) },
    });
    const result = await svc.softDelete(
      TX as never,
      'OWNER',
      'owner-1',
      'admin-1',
    );
    expect(result.deletedAt).toEqual(NOW);
    expect(result.purgeAt.getTime() - NOW.getTime()).toBe(30 * DAY);
    expect(activity.record).toHaveBeenCalledWith(
      TX,
      expect.objectContaining({
        type: 'DELETE',
        summary: 'Deleted owner Ahmed Ali',
      }),
    );
  });

  it('a missing or already-deleted record → 404', async () => {
    const { svc } = makeService();
    await expect(
      svc.softDelete(TX as never, 'OWNER', 'owner-1', 'admin-1'),
    ).rejects.toThrow(NotFoundException);

    const raced = makeService({
      trash: {
        findLive: jest.fn().mockResolvedValue(trashed(NOW)),
        markDeleted: jest.fn().mockResolvedValue(false),
      },
    });
    await expect(
      raced.svc.softDelete(TX as never, 'OWNER', 'owner-1', 'admin-1'),
    ).rejects.toThrow(NotFoundException);
  });
});

describe('TrashRestoreRegistry', () => {
  it('refuses a second handler for the same kind', () => {
    const registry = new TrashRestoreRegistry();
    registry.register('PHOTO', {});
    expect(() => registry.register('PHOTO', {})).toThrow('already registered');
  });
});
