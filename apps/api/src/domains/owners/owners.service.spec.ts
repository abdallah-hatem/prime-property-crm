import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import type { CurrentUser } from '../../common/interfaces/current-user.interface';
import { OwnersService } from './owners.service';

const TX = { tx: true };
const NOW = new Date('2026-10-22T09:00:00.000Z');

const admin: CurrentUser = {
  id: 'admin',
  roleId: 'r-admin',
  permissions: [],
  isAdmin: true,
};
const member: CurrentUser = {
  id: 'member',
  roleId: 'r-member',
  permissions: [],
  isAdmin: false,
};
const importer: CurrentUser = {
  id: 'importer',
  roleId: 'r-imp',
  permissions: ['owners.import'],
  isAdmin: false,
};
const trashAdmin: CurrentUser = {
  ...importer,
  permissions: ['owners.import', 'trash.restore'],
};

const DETAIL = {
  id: 'o1',
  name: 'Owner',
  area: null,
  status: 'NEW',
  createdAt: NOW,
  assignedTo: null,
  phones: [{ phone: '+201001234567' }],
  calls: [],
  reminders: [],
  sourceImport: null,
  listings: [],
};

type Mocks = Record<string, Record<string, jest.Mock>>;

function makeService(overrides: Partial<Mocks> = {}) {
  const m: Mocks = {
    db: { transaction: jest.fn((work: (tx: unknown) => unknown) => work(TX)) },
    owners: {
      whereOf: jest.fn((f: unknown) => f),
      findRows: jest.fn().mockResolvedValue({ rows: [], total: 0 }),
      findIds: jest.fn().mockResolvedValue({ ids: [], total: 0 }),
      findCore: jest.fn().mockResolvedValue({
        id: 'o1',
        name: 'Owner',
        status: 'NEW',
        assignedToId: 'member',
      }),
      findDetail: jest.fn().mockResolvedValue(DETAIL),
      phoneHolders: jest.fn().mockResolvedValue([]),
      createWithPhones: jest.fn().mockResolvedValue({ id: 'o1' }),
      updateFields: jest.fn().mockResolvedValue(undefined),
      replacePhones: jest.fn().mockResolvedValue(undefined),
      hasLiveListing: jest.fn().mockResolvedValue(false),
    },
    users: { languageOf: jest.fn().mockResolvedValue('en') },
    notes: {
      latest: jest.fn().mockResolvedValue([]),
      add: jest.fn().mockResolvedValue({}),
    },
    reminders: { closeOpenReminders: jest.fn().mockResolvedValue(0) },
    assignment: {
      assertAssignee: jest.fn((_tx: unknown, id: string | null) =>
        Promise.resolve(id ? { id, name: 'Sara' } : null),
      ),
      reassignOwnerAndListing: jest.fn().mockResolvedValue({
        ownerIds: ['o1', 'o2'],
        listingIds: [],
        remindersMoved: 0,
      }),
    },
    trash: { softDelete: jest.fn().mockResolvedValue({}) },
    activity: { record: jest.fn().mockResolvedValue(undefined) },
    clock: { now: jest.fn(() => NOW) },
  };
  for (const [key, value] of Object.entries(overrides)) {
    m[key] = { ...m[key], ...value };
  }
  const svc = new OwnersService(
    m.db as never,
    m.owners as never,
    m.users as never,
    m.notes as never,
    m.reminders as never,
    m.assignment as never,
    m.trash as never,
    m.activity as never,
    m.clock as never,
  );
  return {
    svc,
    db: m.db,
    owners: m.owners,
    notes: m.notes,
    reminders: m.reminders,
    assignment: m.assignment,
    trash: m.trash,
    activity: m.activity,
  };
}

describe('OwnersService', () => {
  describe('list scoping', () => {
    it('Member passes `assignedTo=unassigned`, `assignedTo=<other>`, `importId` → still only own owners (invariant)', async () => {
      const { svc, owners } = makeService();
      for (const query of [
        { assignedTo: 'unassigned' },
        { assignedTo: 'someone-else' },
        { importId: 'job' },
      ]) {
        await svc.list({ page: 1, limit: 20, ...query }, member);
        expect(owners.whereOf).toHaveBeenLastCalledWith(
          expect.objectContaining({ memberId: 'member' }),
        );
      }
    });

    it('owners.viewAll reads `assignedTo` (me, unassigned, a user)', async () => {
      const { svc, owners } = makeService();
      await svc.list({ page: 1, limit: 20, assignedTo: 'unassigned' }, admin);
      expect(owners.whereOf).toHaveBeenLastCalledWith(
        expect.objectContaining({ assignedTo: null }),
      );
      await svc.list({ page: 1, limit: 20, assignedTo: 'me' }, admin);
      expect(owners.whereOf).toHaveBeenLastCalledWith(
        expect.objectContaining({ assignedTo: 'admin' }),
      );
    });

    it('/owners/ids reaches every owner but drops phone search without owners.viewAll', async () => {
      const { svc, owners } = makeService();
      const assigner = { ...member, permissions: ['owners.assign' as const] };
      await svc.ids({ take: 10, q: '01001234567' }, assigner);
      const filter = owners.whereOf.mock.calls.at(-1)?.[0] as {
        memberId?: string;
        search?: { phoneDigits: string | null };
      };
      expect(filter.memberId).toBeUndefined();
      expect(filter.search?.phoneDigits).toBeNull();
    });
  });

  describe('create', () => {
    const body = { name: 'Owner', phones: ['01001234567'] };

    it('`POST /owners` with `assignedTo` by a user without `owners.assign` → 403; `assignedTo` inactive → 400 INVALID_ASSIGNEE (role: only assigners assign)', async () => {
      const { svc, db } = makeService();
      await expect(
        svc.create({ ...body, assignedTo: 'sara' }, importer),
      ).rejects.toThrow(ForbiddenException);
      expect(db.transaction).not.toHaveBeenCalled();

      const refused = makeService({
        assignment: {
          assertAssignee: jest
            .fn()
            .mockRejectedValue(new BadRequestException('INVALID_ASSIGNEE')),
        },
      });
      await expect(
        refused.svc.create({ ...body, assignedTo: 'off' }, admin),
      ).rejects.toThrow(BadRequestException);
      expect(refused.owners.createWithPhones).not.toHaveBeenCalled();
    });

    it('stores phones normalised, adds the note, assigns and logs one ASSIGN entry', async () => {
      const { svc, owners, notes, assignment, activity } = makeService();
      await svc.create(
        {
          ...body,
          phones: ['+20 100 123 4567'],
          note: 'hi',
          assignedTo: 'sara',
        },
        admin,
      );
      expect(owners.createWithPhones).toHaveBeenCalledWith(
        TX,
        expect.objectContaining({ name: 'Owner', createdById: 'admin' }),
        ['+201001234567'],
      );
      expect(notes.add).toHaveBeenCalledWith(
        { ownerId: 'o1' },
        'admin',
        'hi',
        TX,
      );
      expect(assignment.reassignOwnerAndListing).toHaveBeenCalledWith(
        TX,
        { ownerIds: ['o1'] },
        'sara',
        'admin',
      );
      expect(activity.record).toHaveBeenCalledTimes(1);
    });

    it('Create owner with a phone already on another owner (any slot) → 409 PHONE_EXISTS with ownerId (invariant)', async () => {
      const { svc } = makeService({
        owners: {
          phoneHolders: jest
            .fn()
            .mockResolvedValue([
              { phone: '+201001234567', ownerId: 'x', ownerDeleted: false },
            ]),
        },
      });
      await expect(svc.create(body, admin)).rejects.toMatchObject({
        response: {
          error: 'PHONE_EXISTS',
          data: { phone: '+201001234567', ownerId: 'x' },
        },
      });
      // Without owners.viewAll: no ids.
      const err = await svc.create(body, importer).catch((e: unknown) => e);
      expect(err).toBeInstanceOf(ConflictException);
      expect((err as ConflictException).getResponse()).not.toHaveProperty(
        'data',
      );
    });

    it("Create owner with a phone that is a listing's owner phone → 409 PHONE_EXISTS with listingId (flow: import duplicates rule)", async () => {
      const { svc } = makeService({
        owners: {
          phoneHolders: jest
            .fn()
            .mockResolvedValue([
              { phone: '+201001234567', listingId: 'l1', linkedOwnerId: null },
            ]),
        },
      });
      await expect(svc.create(body, admin)).rejects.toMatchObject({
        response: { error: 'PHONE_EXISTS', data: { listingId: 'l1' } },
      });
    });

    it('Create owner with a phone that belongs to a trashed owner → 409 PHONE_IN_TRASH (admin) (decision: trashed owners keep their phone)', async () => {
      const holders = jest
        .fn()
        .mockResolvedValue([
          { phone: '+201001234567', ownerId: 'x', ownerDeleted: true },
        ]);
      const { svc } = makeService({ owners: { phoneHolders: holders } });
      await expect(svc.create(body, trashAdmin)).rejects.toMatchObject({
        response: { error: 'PHONE_IN_TRASH' },
      });
      await expect(svc.create(body, importer)).rejects.toMatchObject({
        response: { error: 'PHONE_EXISTS' },
      });
    });

    it('a lost race on the unique phone index → 409 PHONE_EXISTS, not a 500', async () => {
      const race = Object.assign(new Error('unique'), {
        name: 'PrismaClientKnownRequestError',
        code: 'P2002',
      });
      const { svc } = makeService({
        owners: { createWithPhones: jest.fn().mockRejectedValue(race) },
      });
      await expect(svc.create(body, admin)).rejects.toMatchObject({
        response: { error: 'PHONE_EXISTS' },
      });
    });
  });

  describe('update', () => {
    it("Member GET/PATCH/notes/timeline on another member's owner → 404 (invariant + contract)", async () => {
      const { svc } = makeService({
        owners: { findCore: jest.fn().mockResolvedValue(null) },
      });
      await expect(svc.get('o1', member)).rejects.toThrow(NotFoundException);
      await expect(
        svc.update('o1', { doNotCall: false }, member),
      ).rejects.toThrow(NotFoundException);
      await expect(
        svc.listNotes('o1', { page: 1, limit: 20 }, member),
      ).rejects.toThrow(NotFoundException);
      await expect(svc.addNote('o1', 'x', member)).rejects.toThrow(
        NotFoundException,
      );
      await expect(
        svc.timeline('o1', { page: 1, limit: 20 }, member),
      ).rejects.toThrow(NotFoundException);
    });

    it('Member sets Do not call on own owner; member clearing Do not call → 403, admin can clear it to Contacted (business: Do not call flag)', async () => {
      const { svc, owners } = makeService();
      await svc.update('o1', { doNotCall: true }, member);
      expect(owners.updateFields).toHaveBeenLastCalledWith(TX, 'o1', {
        status: 'DO_NOT_CALL',
      });

      const dnc = makeService({
        owners: {
          findCore: jest.fn().mockResolvedValue({
            id: 'o1',
            status: 'DO_NOT_CALL',
            assignedToId: 'member',
          }),
        },
      });
      await expect(
        dnc.svc.update('o1', { doNotCall: false }, member),
      ).rejects.toThrow(ForbiddenException);
      await dnc.svc.update('o1', { doNotCall: false }, admin);
      expect(dnc.owners.updateFields).toHaveBeenLastCalledWith(TX, 'o1', {
        status: 'CONTACTED',
      });
    });

    it("Member PATCHes own owner's phone to another owner's phone → 409 PHONE_EXISTS with no ids (invariant: no data about owners not theirs)", async () => {
      const { svc, owners } = makeService({
        owners: {
          phoneHolders: jest.fn().mockResolvedValue([
            { phone: '+201001234567', ownerId: 'o1', ownerDeleted: false },
            { phone: '+201101234567', ownerId: 'other', ownerDeleted: false },
          ]),
        },
      });
      const err = (await svc
        .update('o1', { phones: ['01001234567', '01101234567'] }, member)
        .catch((e: unknown) => e)) as ConflictException;
      expect(err.getResponse()).toEqual({
        message: expect.any(String),
        error: 'PHONE_EXISTS',
      });
      expect(owners.replacePhones).not.toHaveBeenCalled();
    });

    it("keeping the owner's own phones (and its listing's) is not a conflict", async () => {
      const { svc, owners } = makeService({
        owners: {
          phoneHolders: jest.fn().mockResolvedValue([
            { phone: '+201001234567', ownerId: 'o1', ownerDeleted: false },
            { phone: '+201001234567', listingId: 'l1', linkedOwnerId: 'o1' },
          ]),
        },
      });
      await svc.update('o1', { phones: ['01001234567'] }, member);
      expect(owners.replacePhones).toHaveBeenCalledWith(TX, 'o1', [
        '+201001234567',
      ]);
    });
  });

  describe('delete', () => {
    it('Delete an owner with a listing → 409 OWNER_LISTED (business)', async () => {
      const { svc, trash, reminders } = makeService({
        owners: { hasLiveListing: jest.fn().mockResolvedValue(true) },
      });
      await expect(svc.remove('o1', admin)).rejects.toMatchObject({
        response: { error: 'OWNER_LISTED' },
      });
      expect(trash.softDelete).not.toHaveBeenCalled();
      expect(reminders.closeOpenReminders).not.toHaveBeenCalled();
    });

    it('Delete owner writes an activity entry; its open reminders close; its calls stay (business: activity log; calls never deleted)', async () => {
      const { svc, trash, reminders } = makeService();
      await svc.remove('o1', importer);
      expect(reminders.closeOpenReminders).toHaveBeenCalledWith(TX, {
        ownerIds: ['o1'],
      });
      expect(trash.softDelete).toHaveBeenCalledWith(
        TX,
        'OWNER',
        'o1',
        'importer',
      );
    });
  });

  describe('assign', () => {
    it('Every assignment writes one activity entry per batch with the count (business: activity log)', async () => {
      const { svc, activity } = makeService();
      expect(
        await svc.assign({ ownerIds: ['o1', 'o2'], assigneeId: 'sara' }, admin),
      ).toEqual({ moved: 2 });
      expect(activity.record).toHaveBeenCalledTimes(1);
      expect(activity.record).toHaveBeenCalledWith(
        TX,
        expect.objectContaining({
          type: 'ASSIGN',
          details: { kind: 'OWNERS', count: 2, assigneeId: 'sara' },
        }),
      );
    });

    it('Assign 5001 ids → 400; assign with ids that include a deleted owner → those skipped, `moved` counts the rest (contract)', async () => {
      const { svc, activity } = makeService({
        assignment: {
          reassignOwnerAndListing: jest.fn().mockResolvedValue({
            ownerIds: [],
            listingIds: [],
            remindersMoved: 0,
          }),
        },
      });
      expect(
        await svc.assign({ ownerIds: ['deleted'], assigneeId: null }, admin),
      ).toEqual({ moved: 0 });
      expect(activity.record).not.toHaveBeenCalled();
    });

    it('Assign to an inactive member → 400 INVALID_ASSIGNEE (flow: assign to an active member)', async () => {
      const { svc, assignment } = makeService({
        assignment: {
          assertAssignee: jest
            .fn()
            .mockRejectedValue(new BadRequestException('INVALID_ASSIGNEE')),
        },
      });
      await expect(
        svc.assign({ ownerIds: ['o1'], assigneeId: 'off' }, admin),
      ).rejects.toThrow(BadRequestException);
      expect(assignment.reassignOwnerAndListing).not.toHaveBeenCalled();
    });
  });
});
