import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import type { CurrentUser } from '../../common/interfaces/current-user.interface';
import { RemindersService } from './reminders.service';

const NOW = new Date('2026-10-22T09:00:00.000Z');
const LATER = '2026-10-23T09:00:00.000Z';
const user = (
  permissions: CurrentUser['permissions'] = [],
  id = 'me',
): CurrentUser => ({ id, roleId: 'r', permissions, isAdmin: false });

const row = (fields: Record<string, unknown> = {}) => ({
  id: 'r1',
  kind: 'MANUAL',
  dueAt: new Date(NOW.getTime() - 1),
  note: null,
  doneAt: null,
  owner: { id: 'o1', name: 'Owner' },
  listing: null,
  member: { id: 'me', name: 'Me' },
  ...fields,
});

function makeService(overrides: Record<string, jest.Mock> = {}) {
  const reminders = {
    findPage: jest.fn().mockResolvedValue({ rows: [row()], total: 1 }),
    findFirst: jest.fn().mockResolvedValue([]),
    count: jest.fn().mockResolvedValue(0),
    findOne: jest.fn().mockResolvedValue(row()),
    ownerOf: jest.fn().mockResolvedValue({ id: 'o1' }),
    listingOf: jest.fn().mockResolvedValue({ id: 'l1' }),
    findLiveOwner: jest.fn().mockResolvedValue({ id: 'o1' }),
    findLiveListing: jest.fn().mockResolvedValue({ id: 'l1' }),
    create: jest.fn().mockResolvedValue(row()),
    updateOpen: jest.fn().mockResolvedValue(1),
    moveOpen: jest.fn().mockResolvedValue(2),
    closeOpen: jest.fn().mockResolvedValue(1),
    ...overrides,
  };
  const db = {
    transaction: jest.fn((work: (tx: object) => unknown) => work({})),
  };
  const users = { languageOf: jest.fn().mockResolvedValue('en') };
  const svc = new RemindersService(
    db as never,
    reminders as never,
    users as never,
    { now: () => NOW },
  );
  return { svc, reminders, users };
}

describe('RemindersService', () => {
  describe('list', () => {
    it('Admin lists unassigned open reminders (`GET /reminders?unassigned=true`) (business: visible to the admin)', async () => {
      const { svc, reminders } = makeService();
      const page = await svc.list(
        { page: 1, limit: 20, unassigned: true },
        user(['owners.assign']),
      );
      expect(JSON.stringify(reminders.findPage.mock.calls[0][0])).toContain(
        '"memberId":null',
      );
      expect(page.data[0]).toMatchObject({ id: 'r1', overdue: true });
    });

    it('unassigned=true without owners.assign → 403', async () => {
      const { svc } = makeService();
      await expect(
        svc.list({ page: 1, limit: 20, unassigned: true }, user()),
      ).rejects.toThrow(ForbiddenException);
    });

    it("Member can't read another member's reminders with `memberId` without `analytics.view` → 403 (role)", async () => {
      const { svc } = makeService();
      await expect(
        svc.list({ page: 1, limit: 20, memberId: 'other' }, user()),
      ).rejects.toThrow(ForbiddenException);
      // Their own id is fine, and analytics.view opens anyone's.
      await expect(
        svc.list({ page: 1, limit: 20, memberId: 'me' }, user()),
      ).resolves.toBeDefined();
      await expect(
        svc.list(
          { page: 1, limit: 20, memberId: 'other' },
          user(['analytics.view']),
        ),
      ).resolves.toBeDefined();
    });

    it("without filters: the caller's own reminders", async () => {
      const { svc, reminders } = makeService();
      await svc.list({ page: 1, limit: 20 }, user());
      expect(JSON.stringify(reminders.findPage.mock.calls[0][0])).toContain(
        '"memberId":"me"',
      );
    });
  });

  describe('list by owner or listing', () => {
    it("ownerId: every reminder of a visible owner, not only the caller's", async () => {
      const { svc, reminders } = makeService();
      await svc.list({ page: 1, limit: 20, ownerId: 'o1' }, user());
      expect(reminders.findLiveOwner).toHaveBeenCalledWith('o1', {
        assignedToId: 'me',
      });
      const where = JSON.stringify(reminders.findPage.mock.calls[0][0]);
      expect(where).toContain('"ownerId":"o1"');
      expect(where).not.toContain('"memberId"');
    });

    it('ownerId of an owner the caller may not see → 404; owners.viewAll drops the scope', async () => {
      const { svc, reminders } = makeService({
        findLiveOwner: jest.fn().mockResolvedValue(null),
      });
      await expect(
        svc.list({ page: 1, limit: 20, ownerId: 'o2' }, user()),
      ).rejects.toThrow(NotFoundException);
      expect(reminders.findPage).not.toHaveBeenCalled();
      await svc
        .list({ page: 1, limit: 20, ownerId: 'o2' }, user(['owners.viewAll']))
        .catch(() => undefined);
      expect(reminders.findLiveOwner).toHaveBeenLastCalledWith('o2', {});
    });

    it('listingId is scoped by listings.manageAll', async () => {
      const { svc, reminders } = makeService();
      await svc.list({ page: 1, limit: 20, listingId: 'l1' }, user());
      expect(reminders.findLiveListing).toHaveBeenCalledWith('l1', {
        assignedToId: 'me',
      });
      await svc.list(
        { page: 1, limit: 20, listingId: 'l1' },
        user(['listings.manageAll']),
      );
      expect(reminders.findLiveListing).toHaveBeenLastCalledWith('l1', {});
    });
  });

  describe('today', () => {
    it('counts are COUNT totals, not list lengths', async () => {
      const { svc } = makeService({
        findFirst: jest.fn().mockResolvedValue([row()]),
        count: jest
          .fn()
          .mockResolvedValueOnce(70)
          .mockResolvedValueOnce(3)
          .mockResolvedValueOnce(60)
          .mockResolvedValueOnce(140),
      });
      const today = await svc.today('me');
      expect(today.overdue).toHaveLength(1);
      expect(today.counts).toEqual({
        overdue: 70,
        dueToday: 3,
        adTasks: 60,
        remindersOpen: 140,
      });
    });

    it('listing titles follow the reader language', async () => {
      const listing = { id: 'l1', type: 'VILLA', bedrooms: 4, area: 'Zayed' };
      const { svc, users } = makeService({
        findFirst: jest.fn().mockResolvedValue([row({ listing, owner: null })]),
      });
      users.languageOf.mockResolvedValue('ar');
      const today = await svc.today('me');
      expect(today.overdue[0].listing?.title).toBe('فيلا · 4 غرف · Zayed');
    });
  });

  describe('create', () => {
    it("Reminder on someone else's owner → 404 (invariant)", async () => {
      const { svc, reminders } = makeService({
        ownerOf: jest.fn().mockResolvedValue(null),
      });
      await expect(
        svc.create({ ownerId: 'o2', dueAt: LATER }, user()),
      ).rejects.toThrow(NotFoundException);
      expect(reminders.create).not.toHaveBeenCalled();
    });

    it('a due time not in the future → 400 REMINDER_IN_PAST', async () => {
      const { svc } = makeService();
      await expect(
        svc.create({ ownerId: 'o1', dueAt: NOW.toISOString() }, user()),
      ).rejects.toThrow(BadRequestException);
    });

    it('creates a MANUAL reminder for the caller', async () => {
      const { svc, reminders } = makeService();
      await svc.create({ listingId: 'l1', dueAt: LATER, note: 'call' }, user());
      expect(reminders.create.mock.calls[0][1]).toMatchObject({
        kind: 'MANUAL',
        listingId: 'l1',
        ownerId: null,
        memberId: 'me',
        note: 'call',
      });
    });
  });

  describe('update and done', () => {
    it('PATCH a done reminder → 409 REMINDER_DONE (contract)', async () => {
      const { svc } = makeService({
        findOne: jest.fn().mockResolvedValue(row({ doneAt: NOW })),
      });
      await expect(svc.update('r1', { note: 'x' }, user())).rejects.toThrow(
        ConflictException,
      );
    });

    it('PATCH `dueAt` of an AD_TAKE_DOWN reminder → 400 SYSTEM_REMINDER (business)', async () => {
      const { svc, reminders } = makeService({
        findOne: jest.fn().mockResolvedValue(row({ kind: 'AD_TAKE_DOWN' })),
      });
      await expect(
        svc.update('r1', { dueAt: LATER }, user()),
      ).rejects.toMatchObject({
        response: { error: 'SYSTEM_REMINDER' },
      });
      // Its note can still change.
      await svc.update('r1', { note: 'agent called' }, user());
      expect(reminders.updateOpen).toHaveBeenCalledWith({}, 'r1', {
        note: 'agent called',
      });
    });

    it("PATCH or done on another member's reminder → 404 (invariant)", async () => {
      const { svc } = makeService({
        findOne: jest.fn().mockResolvedValue(null),
      });
      await expect(svc.update('r1', { note: 'x' }, user())).rejects.toThrow(
        NotFoundException,
      );
      await expect(svc.done('r1', user())).rejects.toThrow(NotFoundException);
    });

    it('Mark an AD_TAKE_DOWN or AD_CHECK_IN reminder done manually → 400 SYSTEM_REMINDER (business: take-down closes only on Taken down)', async () => {
      for (const kind of ['AD_TAKE_DOWN', 'AD_CHECK_IN']) {
        const { svc, reminders } = makeService({
          findOne: jest.fn().mockResolvedValue(row({ kind })),
        });
        await expect(svc.done('r1', user())).rejects.toMatchObject({
          response: { error: 'SYSTEM_REMINDER' },
        });
        expect(reminders.updateOpen).not.toHaveBeenCalled();
      }
    });

    it('done on a done reminder changes nothing', async () => {
      const { svc, reminders } = makeService({
        findOne: jest.fn().mockResolvedValue(row({ doneAt: NOW })),
      });
      await expect(svc.done('r1', user())).resolves.toMatchObject({
        doneAt: NOW.toISOString(),
      });
      expect(reminders.updateOpen).not.toHaveBeenCalled();
    });
  });

  it('closing uses the clock; moving passes the target member through', async () => {
    const { svc, reminders } = makeService();
    // No kinds = the record is deleted: flagged closedByDelete (analytics: not "done").
    await svc.closeOpenReminders({} as never, { ownerIds: ['o1'] });
    expect(reminders.closeOpen).toHaveBeenCalledWith(
      {},
      { ownerIds: ['o1'] },
      NOW,
      undefined,
      true,
    );
    await svc.closeOpenReminders({} as never, { listingIds: ['l1'] }, [
      'AD_TAKE_DOWN',
    ]);
    expect(reminders.closeOpen).toHaveBeenLastCalledWith(
      {},
      { listingIds: ['l1'] },
      NOW,
      ['AD_TAKE_DOWN'],
      false,
    );
    await svc.moveOpenReminders({} as never, { listingIds: ['l1'] }, null);
    expect(reminders.moveOpen).toHaveBeenCalledWith(
      {},
      { listingIds: ['l1'] },
      null,
    );
  });
});
