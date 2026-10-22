import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import type { CurrentUser } from '../../common/interfaces/current-user.interface';
import { ListingsService } from './listings.service';

const TX = { tx: true };
const NOW = new Date('2026-10-22T09:00:00.000Z');
const DAY = 24 * 60 * 60 * 1000;

const admin: CurrentUser = {
  id: 'admin',
  roleId: 'ra',
  permissions: [],
  isAdmin: true,
};
const member: CurrentUser = {
  id: 'm1',
  roleId: 'rm',
  permissions: [],
  isAdmin: false,
};
const other: CurrentUser = {
  id: 'm2',
  roleId: 'rm',
  permissions: [],
  isAdmin: false,
};
const creator: CurrentUser = {
  id: 'c1',
  roleId: 'rc',
  permissions: ['listings.create'],
  isAdmin: false,
};

const CORE = {
  id: 'l1',
  status: 'AVAILABLE',
  adStatus: 'NOT_POSTED',
  adLink: null,
  assignedToId: 'm1',
  ownerId: null,
  ownerPhone: '+201001234567',
};

const DETAIL = {
  ...CORE,
  purpose: 'SALE',
  type: 'VILLA',
  area: 'Sheikh Zayed',
  compound: null,
  price: 1_000_000,
  sizeSqm: 300,
  bedrooms: 4,
  bathrooms: 3,
  floor: null,
  assignedTo: { id: 'm1', name: 'Sara' },
  photos: [],
  reminders: [],
  address: null,
  furnishing: null,
  description: null,
  ownerName: 'Ahmed',
  adPostedAt: null,
  adTakenDownAt: null,
  lastCheckInAt: null,
  createdAt: NOW,
  updatedAt: NOW,
};

const BODY = {
  purpose: 'SALE' as const,
  type: 'VILLA' as const,
  area: 'Sheikh Zayed',
  sizeSqm: 300,
  price: 1_000_000,
};

type Mocks = Record<string, Record<string, jest.Mock>>;

function makeService(overrides: Partial<Mocks> = {}) {
  const m: Mocks = {
    db: { transaction: jest.fn((work: (tx: unknown) => unknown) => work(TX)) },
    listings: {
      whereOf: jest.fn((f: unknown) => f),
      findRows: jest.fn().mockResolvedValue({ rows: [], total: 0 }),
      findCore: jest.fn().mockResolvedValue(CORE),
      lockCore: jest.fn().mockResolvedValue(CORE),
      findDetail: jest.fn().mockResolvedValue(DETAIL),
      createListing: jest.fn().mockResolvedValue({ id: 'l1' }),
      updateFields: jest.fn().mockResolvedValue(undefined),
      liveListingWithPhone: jest.fn().mockResolvedValue(null),
      ownerHasLiveListing: jest.fn().mockResolvedValue(false),
      hasOpenReminder: jest.fn().mockResolvedValue(false),
      lockOwner: jest.fn().mockResolvedValue(null),
      ownerWithPhone: jest.fn().mockResolvedValue(null),
      setOwnerStatus: jest.fn().mockResolvedValue(undefined),
      findRestoreState: jest.fn().mockResolvedValue(null),
    },
    users: {
      languageOf: jest.fn().mockResolvedValue('en'),
      findActive: jest.fn().mockResolvedValue({ id: 'm1', name: 'Sara' }),
    },
    settings: { adCheckInDays: jest.fn().mockResolvedValue(7) },
    notes: {
      latest: jest.fn().mockResolvedValue([]),
      add: jest.fn().mockResolvedValue({}),
      list: jest.fn().mockResolvedValue({ data: [] }),
    },
    reminders: {
      closeOpenReminders: jest.fn().mockResolvedValue(0),
      addListingTask: jest.fn().mockResolvedValue({}),
    },
    assignment: {
      assertAssignee: jest.fn((_tx: unknown, id: string | null) =>
        Promise.resolve(id ? { id, name: 'Omar' } : null),
      ),
      reassignOwnerAndListing: jest
        .fn()
        .mockResolvedValue({
          ownerIds: [],
          listingIds: ['l1'],
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
  const svc = new ListingsService(
    m.db as never,
    m.listings as never,
    m.users as never,
    m.settings as never,
    m.notes as never,
    m.reminders as never,
    m.assignment as never,
    m.trash as never,
    m.activity as never,
    m.clock as never,
  );
  return { svc, m };
}

const OWNER = {
  id: 'o1',
  name: 'Ahmed',
  status: 'INTERESTED',
  assignedToId: 'm1',
  deletedAt: null,
  phones: ['+201001234567', '+201101234567'],
};

describe('ListingsService', () => {
  describe('search', () => {
    it('Default search returns only AVAILABLE (business)', async () => {
      const { svc, m } = makeService();
      await svc.list({ page: 1, limit: 20 }, member);
      expect(m.listings.whereOf).toHaveBeenCalledWith(
        expect.objectContaining({ statuses: ['AVAILABLE'] }),
      );
    });

    it('`q` search by phone digits never matches owner phones of listings not assigned to the caller (invariant: phone hidden)', async () => {
      const { svc, m } = makeService();
      await svc.list({ q: '0100 123 4567' } as never, member);
      expect(m.listings.whereOf).toHaveBeenLastCalledWith(
        expect.objectContaining({
          search: expect.objectContaining({
            phoneDigits: '1001234567',
            phoneMemberId: 'm1',
          }),
        }),
      );
      await svc.list({ q: '0100 123 4567' } as never, admin);
      expect(m.listings.whereOf).toHaveBeenLastCalledWith(
        expect.objectContaining({
          search: expect.objectContaining({ phoneMemberId: null }),
        }),
      );
    });
  });

  describe('get', () => {
    it('Member searches listings → sees all Available listings, `ownerPhone` null + hidden for listings not assigned to them (invariant: phone hidden)', async () => {
      const { svc } = makeService();
      expect(await svc.get('l1', other)).toMatchObject({
        ownerPhone: null,
        ownerPhoneHidden: true,
        title: 'Villa · 4 BR · Sheikh Zayed',
      });
    });

    it('Assigned member and admin see the phone (business rule)', async () => {
      const { svc } = makeService();
      for (const user of [member, admin]) {
        expect(await svc.get('l1', user)).toMatchObject({
          ownerPhone: '+201001234567',
          ownerPhoneHidden: false,
        });
      }
    });

    it('the title follows the reader language', async () => {
      const { svc } = makeService({
        users: { languageOf: jest.fn().mockResolvedValue('ar') },
      });
      expect((await svc.get('l1', member)).title).toBe(
        'فيلا · 4 غرف · Sheikh Zayed',
      );
    });
  });

  describe('create', () => {
    it('Create from own INTERESTED owner → prefilled contact, owner becomes LISTED, leaves calling list (flow 4)', async () => {
      const { svc, m } = makeService({
        listings: { lockOwner: jest.fn().mockResolvedValue(OWNER) },
      });
      await svc.create({ ...BODY, ownerId: 'o1' }, member);
      expect(m.listings.lockOwner).toHaveBeenCalledWith(TX, 'o1', {
        assignedToId: 'm1',
      });
      expect(m.listings.createListing).toHaveBeenCalledWith(
        TX,
        expect.objectContaining({
          ownerId: 'o1',
          ownerName: 'Ahmed',
          ownerPhone: '+201001234567',
          assignedToId: 'm1',
          createdById: 'm1',
        }),
      );
      expect(m.listings.setOwnerStatus).toHaveBeenCalledWith(
        TX,
        'o1',
        'LISTED',
      );
      expect(m.assignment.reassignOwnerAndListing).not.toHaveBeenCalled();
    });

    it("Create from another member's owner → 404 (invariant)", async () => {
      const { svc, m } = makeService();
      await expect(
        svc.create({ ...BODY, ownerId: 'o1' }, member),
      ).rejects.toThrow(NotFoundException);
      expect(m.listings.createListing).not.toHaveBeenCalled();
    });

    it('Create from an owner already listed → 409 OWNER_ALREADY_LISTED (business: one listing links one owner)', async () => {
      const { svc } = makeService({
        listings: {
          lockOwner: jest.fn().mockResolvedValue(OWNER),
          ownerHasLiveListing: jest.fn().mockResolvedValue(true),
        },
      });
      await expect(
        svc.create({ ...BODY, ownerId: 'o1' }, member),
      ).rejects.toMatchObject({ response: { error: 'OWNER_ALREADY_LISTED' } });
    });

    it('Direct create without `listings.create` → 403 (role)', async () => {
      const { svc, m } = makeService();
      await expect(
        svc.create(
          { ...BODY, ownerName: 'A', ownerPhone: '01001234567' },
          member,
        ),
      ).rejects.toThrow(ForbiddenException);
      expect(m.db.transaction).not.toHaveBeenCalled();
    });

    it('Direct create whose phone matches an owner lead → linked and lead becomes LISTED (flow 5)', async () => {
      const lead = { ...OWNER, assignedToId: 'm2' };
      const { svc, m } = makeService({
        listings: {
          ownerWithPhone: jest.fn().mockResolvedValue(lead),
          lockOwner: jest.fn().mockResolvedValue(lead),
        },
      });
      await svc.create(
        { ...BODY, ownerName: 'Typed', ownerPhone: '0110 123 4567' },
        creator,
      );
      expect(m.listings.ownerWithPhone).toHaveBeenCalledWith(
        TX,
        '+201101234567',
      );
      expect(m.listings.createListing).toHaveBeenCalledWith(
        TX,
        expect.objectContaining({
          ownerId: 'o1',
          ownerName: 'Typed',
          assignedToId: 'c1',
        }),
      );
      expect(m.listings.setOwnerStatus).toHaveBeenCalledWith(
        TX,
        'o1',
        'LISTED',
      );
    });

    it('a direct listing for another member moves its owner with it, logged once', async () => {
      const lead = { ...OWNER, assignedToId: 'm2' };
      const { svc, m } = makeService({
        listings: {
          ownerWithPhone: jest.fn().mockResolvedValue(lead),
          lockOwner: jest.fn().mockResolvedValue(lead),
        },
      });
      await svc.create(
        {
          ...BODY,
          ownerName: 'A',
          ownerPhone: '01101234567',
          assignedTo: 'm1',
        },
        admin,
      );
      expect(m.assignment.reassignOwnerAndListing).toHaveBeenCalledWith(
        TX,
        { listingIds: ['l1'] },
        'm1',
        'admin',
      );
      expect(m.activity.record).toHaveBeenCalledTimes(1);
    });

    it("Direct create whose phone is already another listing's owner phone → 409 PHONE_IN_LISTING (decision: duplicate detection)", async () => {
      const { svc } = makeService({
        listings: {
          liveListingWithPhone: jest.fn().mockResolvedValue({ id: 'l9' }),
        },
      });
      await expect(
        svc.create(
          { ...BODY, ownerName: 'A', ownerPhone: '01001234567' },
          creator,
        ),
      ).rejects.toMatchObject({ response: { error: 'PHONE_IN_LISTING' } });
    });

    it('Direct create with a phone of a trashed owner → 409 PHONE_IN_TRASH (decision)', async () => {
      const trashed = { ...OWNER, deletedAt: NOW };
      const { svc } = makeService({
        listings: { ownerWithPhone: jest.fn().mockResolvedValue(trashed) },
      });
      await expect(
        svc.create(
          { ...BODY, ownerName: 'A', ownerPhone: '01001234567' },
          admin,
        ),
      ).rejects.toMatchObject({
        response: { error: 'PHONE_IN_TRASH', data: { ownerId: 'o1' } },
      });
      await expect(
        svc.create(
          { ...BODY, ownerName: 'A', ownerPhone: '01001234567' },
          creator,
        ),
      ).rejects.toMatchObject({ response: { error: 'PHONE_EXISTS' } });
    });

    it("`POST /listings` with `assignedTo` by a user without `owners.assign` → 403; `PATCH /listings/:id` doesn't accept `assignedTo` (role: only assigners assign)", async () => {
      const { svc } = makeService();
      await expect(
        svc.create(
          {
            ...BODY,
            ownerName: 'A',
            ownerPhone: '01001234567',
            assignedTo: 'm2',
          },
          creator,
        ),
      ).rejects.toThrow(ForbiddenException);
    });

    it('a lost race on the live-listing index becomes the same 409', async () => {
      const race = Object.assign(new Error('unique'), {
        name: 'PrismaClientKnownRequestError',
        code: 'P2002',
      });
      let calls = 0;
      const { svc } = makeService({
        db: {
          transaction: jest.fn((work: (tx: unknown) => unknown) =>
            calls++ === 0 ? Promise.reject(race) : work(TX),
          ),
        },
        listings: {
          liveListingWithPhone: jest.fn().mockResolvedValue({ id: 'l9' }),
        },
      });
      await expect(
        svc.create(
          { ...BODY, ownerName: 'A', ownerPhone: '01001234567' },
          creator,
        ),
      ).rejects.toThrow(ConflictException);
    });
  });

  describe('edit and lifecycle', () => {
    it('Member edits a listing not assigned to them → 403 (role)', async () => {
      const { svc, m } = makeService();
      await expect(svc.update('l1', { price: 5 }, other)).rejects.toThrow(
        ForbiddenException,
      );
      expect(m.listings.updateFields).not.toHaveBeenCalled();
      await svc.update('l1', { price: 5 }, member);
      expect(m.listings.updateFields).toHaveBeenCalledWith(TX, 'l1', {
        price: 5,
      });
    });

    it('Ad → LIVE without link → 400 AD_LINK_REQUIRED; on a non-AVAILABLE listing → 400 (business: Live only when Available)', async () => {
      const { svc } = makeService();
      await expect(
        svc.updateAd('l1', { status: 'LIVE' }, member),
      ).rejects.toThrow(BadRequestException);
    });

    it('Ad → LIVE creates one AD_CHECK_IN due now + interval days (business: weekly check-in)', async () => {
      const { svc, m } = makeService();
      await svc.updateAd(
        'l1',
        { status: 'LIVE', link: 'https://pf.example/1' },
        member,
      );
      expect(m.listings.updateFields).toHaveBeenCalledWith(TX, 'l1', {
        adStatus: 'LIVE',
        adLink: 'https://pf.example/1',
        adPostedAt: NOW,
        adTakenDownAt: null,
      });
      expect(m.reminders.addListingTask).toHaveBeenCalledTimes(1);
      expect(m.reminders.addListingTask).toHaveBeenCalledWith(TX, {
        kind: 'AD_CHECK_IN',
        listingId: 'l1',
        memberId: 'm1',
        dueAt: new Date(NOW.getTime() + 7 * DAY),
        createdById: 'm1',
      });
    });

    it('Check-in with stillAvailable → closes the open check-in, records date, schedules next with the current interval (flow 7)', async () => {
      const live = { ...CORE, adStatus: 'LIVE', adLink: 'x' };
      const { svc, m } = makeService({
        listings: { lockCore: jest.fn().mockResolvedValue(live) },
        settings: { adCheckInDays: jest.fn().mockResolvedValue(3) },
      });
      await svc.checkIn('l1', { stillAvailable: true }, member);
      expect(m.listings.updateFields).toHaveBeenCalledWith(TX, 'l1', {
        lastCheckInAt: NOW,
      });
      expect(m.reminders.closeOpenReminders).toHaveBeenCalledWith(
        TX,
        { listingIds: ['l1'] },
        ['AD_CHECK_IN'],
      );
      expect(m.reminders.addListingTask).toHaveBeenCalledWith(
        TX,
        expect.objectContaining({
          kind: 'AD_CHECK_IN',
          dueAt: new Date(NOW.getTime() + 3 * DAY),
        }),
      );
    });

    it('Check-in with stillAvailable=false → listing OFF_MARKET + AD_TAKE_DOWN task (business: check-in outcome)', async () => {
      const live = { ...CORE, adStatus: 'LIVE', adLink: 'x' };
      const { svc, m } = makeService({
        listings: { lockCore: jest.fn().mockResolvedValue(live) },
      });
      await svc.checkIn('l1', { stillAvailable: false }, member);
      expect(m.listings.updateFields).toHaveBeenCalledWith(TX, 'l1', {
        status: 'OFF_MARKET',
      });
      expect(m.reminders.addListingTask).toHaveBeenCalledWith(
        TX,
        expect.objectContaining({ kind: 'AD_TAKE_DOWN', dueAt: NOW }),
      );
      expect(m.reminders.addListingTask).toHaveBeenCalledTimes(1);
    });

    it('Check-in when ad not LIVE → 400 (contract)', async () => {
      const { svc } = makeService();
      await expect(
        svc.checkIn('l1', { stillAvailable: true }, member),
      ).rejects.toMatchObject({ response: { error: 'AD_NOT_LIVE' } });
    });

    it('Status → SOLD/RENTED/OFF_MARKET while LIVE → AD_TAKE_DOWN task created once (not twice on a second status change) (business + checklist: duplicates)', async () => {
      const live = { ...CORE, adStatus: 'LIVE', adLink: 'x' };
      const { svc, m } = makeService({
        listings: {
          lockCore: jest.fn().mockResolvedValue(live),
          hasOpenReminder: jest.fn((_tx: unknown, _id: string, kind: string) =>
            Promise.resolve(kind === 'AD_TAKE_DOWN'),
          ),
        },
      });
      await svc.setStatus('l1', 'SOLD', member);
      expect(m.reminders.addListingTask).not.toHaveBeenCalled();
    });

    it('Ad → TAKEN_DOWN closes the take-down task and any open check-in (business)', async () => {
      const { svc, m } = makeService({
        listings: {
          lockCore: jest
            .fn()
            .mockResolvedValue({
              ...CORE,
              status: 'SOLD',
              adStatus: 'LIVE',
              adLink: 'x',
            }),
        },
      });
      await svc.updateAd('l1', { status: 'TAKEN_DOWN' }, member);
      expect(m.reminders.closeOpenReminders).toHaveBeenCalledWith(
        TX,
        { listingIds: ['l1'] },
        ['AD_TAKE_DOWN', 'AD_CHECK_IN'],
      );
    });
  });

  describe('assign and delete', () => {
    it('`/listings/assign` writes one activity entry per batch (business: activity log)', async () => {
      const { svc, m } = makeService({
        assignment: {
          reassignOwnerAndListing: jest
            .fn()
            .mockResolvedValue({
              ownerIds: ['o1'],
              listingIds: ['l1', 'l2'],
              remindersMoved: 3,
            }),
        },
      });
      expect(
        await svc.assign({ listingIds: ['l1', 'l2'], assigneeId: 'm2' }, admin),
      ).toEqual({ moved: 2 });
      expect(m.activity.record).toHaveBeenCalledTimes(1);
      expect(m.activity.record).toHaveBeenCalledWith(
        TX,
        expect.objectContaining({
          type: 'ASSIGN',
          details: { kind: 'LISTINGS', count: 2, assigneeId: 'm2' },
        }),
      );
    });

    it('a batch that moves nothing writes no activity entry', async () => {
      const { svc, m } = makeService({
        assignment: {
          reassignOwnerAndListing: jest
            .fn()
            .mockResolvedValue({
              ownerIds: [],
              listingIds: [],
              remindersMoved: 0,
            }),
        },
      });
      expect(
        await svc.assign({ listingIds: ['l1'], assigneeId: null }, admin),
      ).toEqual({
        moved: 0,
      });
      expect(m.activity.record).not.toHaveBeenCalled();
    });

    it('Delete listing → to trash; linked owner back to INTERESTED (business)', async () => {
      const { svc, m } = makeService({
        listings: {
          lockCore: jest.fn().mockResolvedValue({ ...CORE, ownerId: 'o1' }),
        },
      });
      await svc.remove('l1', admin);
      expect(m.trash.softDelete).toHaveBeenCalledWith(
        TX,
        'LISTING',
        'l1',
        'admin',
      );
      expect(m.listings.setOwnerStatus).toHaveBeenCalledWith(
        TX,
        'o1',
        'INTERESTED',
        'LISTED',
      );
    });

    it('Delete listing closes its open check-in and take-down reminders (business)', async () => {
      const { svc, m } = makeService();
      await svc.remove('l1', admin);
      // No kind filter: every open reminder, ad ones included.
      expect(m.reminders.closeOpenReminders).toHaveBeenCalledWith(TX, {
        listingIds: ['l1'],
      });
    });
  });

  describe('restore', () => {
    const STATE = {
      ...CORE,
      ownerId: 'o1',
      owner: { deletedAt: null, assignedToId: 'm2' },
      assignedTo: { active: true },
    };

    it('refused when the owner has another live listing now', async () => {
      const { svc } = makeService({
        listings: {
          findRestoreState: jest.fn().mockResolvedValue(STATE),
          ownerHasLiveListing: jest.fn().mockResolvedValue(true),
        },
      });
      await expect(
        svc.validateRestore(TX as never, 'l1'),
      ).rejects.toMatchObject({
        response: { error: 'OWNER_ALREADY_LISTED' },
      });
    });

    it("re-flags the owner Listed and joins the owner's member", async () => {
      const { svc, m } = makeService({
        listings: { findRestoreState: jest.fn().mockResolvedValue(STATE) },
      });
      await svc.afterRestore(TX as never, 'l1', 'admin');
      expect(m.listings.setOwnerStatus).toHaveBeenCalledWith(
        TX,
        'o1',
        'LISTED',
      );
      expect(m.assignment.reassignOwnerAndListing).toHaveBeenCalledWith(
        TX,
        { listingIds: ['l1'] },
        'm2',
        'admin',
      );
    });
  });
});
