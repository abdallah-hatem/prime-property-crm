import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import type { Prisma, PrismaClient } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { configureApp } from '../src/app.setup';
import { Clock } from '../src/common/providers/clock';
import { createTestDb, randomLocalMobile } from './helpers';
import {
  bearer,
  createUserWithToken,
  ensureBuiltInRoles,
  signExpiredToken,
} from './helpers-auth';

/**
 * T11 — analytics. Every analytics case of the plan's T11 section is an `it` named after it,
 * then the generic checklist. The data sits in March 2025 (Cairo is UTC+2 then), a range no
 * other suite writes to, so counts per member are exact.
 *
 * Range R = 2025-03-10 .. 2025-03-12 (Cairo) = [2025-03-09T22:00Z, 2025-03-12T22:00Z).
 */

type Actor = Awaited<ReturnType<typeof createUserWithToken>>;

const e164 = (local: string) => `+20${local.slice(1)}`;
const R = 'from=2025-03-10&to=2025-03-12';
const T = (iso: string) => new Date(iso);

interface StatsBody {
  calls: number;
  outcomes: { outcomeId: string; label: string; count: number }[];
  remindersDone: number;
  remindersOverdue: number;
  assignedOwners: number;
  interestedOwners: number;
  listingsCreated: number;
  adsLive: number;
  adsTakenDown: number;
}
type MemberRow = StatsBody & { id: string; name: string; active: boolean };

describe('Analytics (e2e)', () => {
  let app: INestApplication;
  let db: PrismaClient;
  let frozen: Date | null = null;
  const http = () => request(app.getHttpServer());
  const run = `T11a-${Date.now()}`;

  let admin: Actor;
  let lead: Actor; // analytics.view only
  let mA: Actor; // calls
  let mB: Actor; // stats at the end / inside the range
  let mC: Actor; // reminders
  let mOff: Actor; // deactivated, worked in R
  let mIdle: Actor; // deactivated, did nothing in R
  const users: string[] = [];
  const roles: string[] = [];
  const outcomeIds: string[] = [];
  let outInterested: string;
  let outNoAnswer: string;

  const get = (actor: Actor, path: string) =>
    http().get(`/api${path}`).set(bearer(actor.token));

  async function newOutcome(
    label: string,
    setsStatus: 'INTERESTED' | 'CONTACTED',
  ): Promise<string> {
    const o = await db.callOutcome.create({
      data: {
        labelEn: `${run} ${label}`,
        labelAr: `${label} ع`,
        setsStatus,
        order: 9000 + outcomeIds.length,
      },
    });
    outcomeIds.push(o.id);
    return o.id;
  }

  async function seedOwner(
    fields: Partial<Prisma.OwnerUncheckedCreateInput> = {},
  ): Promise<string> {
    const o = await db.owner.create({
      data: {
        name: `${run} owner`,
        createdById: admin.id,
        createdAt: T('2025-03-01T10:00:00Z'),
        phones: { create: [{ phone: e164(randomLocalMobile()) }] },
        ...fields,
      },
    });
    return o.id;
  }

  async function seedCall(
    memberId: string,
    startedAt: string,
    outcomeId: string | null = null,
    ownerId: string | null = null,
  ): Promise<void> {
    await db.call.create({
      data: {
        memberId,
        ownerId,
        ownerName: `${run} called`,
        phone: e164(randomLocalMobile()),
        clientRequestId: randomUUID(),
        startedAt: T(startedAt),
        outcomeId,
        outcomeAt: outcomeId ? T(startedAt) : null,
      },
    });
  }

  async function seedListing(
    fields: Partial<Prisma.ListingUncheckedCreateInput> = {},
  ): Promise<string> {
    const l = await db.listing.create({
      data: {
        purpose: 'SALE',
        type: 'APARTMENT',
        area: `${run} area`,
        sizeSqm: 100,
        price: 1_000_000,
        ownerName: `${run} listing owner`,
        ownerPhone: e164(randomLocalMobile()),
        createdById: admin.id,
        createdAt: T('2025-03-01T10:00:00Z'),
        ...fields,
      },
    });
    return l.id;
  }

  async function seedReminder(
    memberId: string,
    fields: Partial<Prisma.ReminderUncheckedCreateInput> & { dueAt: Date },
  ): Promise<string> {
    const ownerId = fields.ownerId ?? (await seedOwner());
    const r = await db.reminder.create({
      data: {
        kind: 'MANUAL',
        memberId,
        ownerId,
        createdAt: T('2025-03-01T10:00:00Z'),
        ...fields,
      },
    });
    return r.id;
  }

  const team = async (actor: Actor, query = R) =>
    (await get(actor, `/analytics/team?${query}`).expect(200)).body.data as {
      range: { from: string; to: string };
      totals: StatsBody;
      members: MemberRow[];
    };
  const memberStats = async (actor: Actor, id: string, query = R) =>
    (await get(actor, `/analytics/members/${id}?${query}`).expect(200)).body
      .data as MemberRow & {
      range: { from: string; to: string };
      byDay: { date: string; calls: number }[];
    };

  // ---------------------------------------------------------------- lifecycle

  beforeAll(async () => {
    db = createTestDb();
    const { adminRoleId, memberRoleId } = await ensureBuiltInRoles(db);
    admin = await createUserWithToken(db, 't11-admin', adminRoleId, []);
    const leadRole = await db.role.create({
      data: { name: `${run} lead`, permissions: ['analytics.view'] },
    });
    roles.push(leadRole.id);
    lead = await createUserWithToken(db, 't11-lead', leadRole.id, [
      'analytics.view',
    ]);
    mA = await createUserWithToken(db, 't11-a', memberRoleId, []);
    mB = await createUserWithToken(db, 't11-b', memberRoleId, []);
    mC = await createUserWithToken(db, 't11-c', memberRoleId, []);
    mOff = await createUserWithToken(db, 't11-off', memberRoleId, []);
    mIdle = await createUserWithToken(db, 't11-idle', memberRoleId, []);
    users.push(admin.id, lead.id, mA.id, mB.id, mC.id, mOff.id, mIdle.id);
    await db.user.updateMany({
      where: { id: { in: [mOff.id, mIdle.id] } },
      data: { active: false, deactivatedAt: T('2025-03-20T10:00:00Z') },
    });

    outInterested = await newOutcome('Interested', 'INTERESTED');
    outNoAnswer = await newOutcome('No answer', 'CONTACTED');

    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = moduleRef.createNestApplication();
    configureApp(app);
    await app.init();
    const clock = app.get(Clock);
    jest
      .spyOn(clock, 'now')
      .mockImplementation(() => (frozen ? new Date(frozen) : new Date()));
  });

  afterEach(() => {
    frozen = null;
  });

  afterAll(async () => {
    if (db) {
      const where = { in: users };
      await db.activityEntry.deleteMany({ where: { actorId: where } });
      await db.call.deleteMany({ where: { memberId: where } });
      await db.reminder.deleteMany({
        where: { OR: [{ memberId: where }, { createdById: where }] },
      });
      await db.ownerAssignment.deleteMany({
        where: {
          OR: [{ byId: where }, { fromMemberId: where }, { toMemberId: where }],
        },
      });
      await db.listing.deleteMany({ where: { createdById: where } });
      await db.owner.deleteMany({ where: { createdById: where } });
      await db.callOutcome.deleteMany({ where: { id: { in: outcomeIds } } });
      await db.user.deleteMany({ where: { id: where } });
      await db.role.deleteMany({ where: { id: { in: roles } } });
      await db.$disconnect();
    }
    await app?.close();
  });

  // ================================================================ plan cases

  it('Member calls analytics → 403 (role)', async () => {
    for (const path of ['/analytics/team', `/analytics/members/${mA.id}`]) {
      const res = await get(mA, path).expect(403);
      expect(res.body.error).toBe('FORBIDDEN');
    }
    await get(lead, '/analytics/team').expect(200);
    await get(lead, `/analytics/members/${mA.id}`).expect(200);
  });

  it('Default range is today in Cairo (business: default today)', async () => {
    // 2026-10-22T21:30Z is 00:30 on 23 October in Cairo (UTC+3 until the 29th).
    frozen = T('2026-10-22T21:30:00Z');
    await seedCall(mA.id, '2026-10-22T21:10:00Z'); // Cairo 23 Oct 00:10 → today
    await seedCall(mA.id, '2026-10-22T20:50:00Z'); // Cairo 22 Oct 23:50 → yesterday

    const t = (await get(admin, '/analytics/team').expect(200)).body.data;
    expect(t.range).toEqual({ from: '2026-10-23', to: '2026-10-23' });
    const row = t.members.find((m: MemberRow) => m.id === mA.id);
    expect(row.calls).toBe(1);

    const one = (await get(admin, `/analytics/members/${mA.id}`).expect(200))
      .body.data;
    expect(one.range).toEqual({ from: '2026-10-23', to: '2026-10-23' });
    expect(one.calls).toBe(1);
    expect(one.byDay).toEqual([{ date: '2026-10-23', calls: 1 }]);

    // One end only = that single day.
    const single = await memberStats(admin, mA.id, 'from=2026-10-22');
    expect(single.range).toEqual({ from: '2026-10-22', to: '2026-10-22' });
    expect(single.calls).toBe(1);
  });

  it('`from` after `to`, range > 366 days → 400 (contract)', async () => {
    const bad = [
      'from=2025-03-12&to=2025-03-10',
      'from=2024-01-01&to=2025-01-01', // 367 days (2024 is a leap year)
    ];
    for (const q of bad) {
      for (const path of ['/analytics/team', `/analytics/members/${mA.id}`]) {
        const res = await get(admin, `${path}?${q}`).expect(400);
        expect(res.body.error).toBe('INVALID_RANGE');
      }
    }
    // Exactly 366 days is allowed; from = to is one day.
    await get(admin, '/analytics/team?from=2024-01-01&to=2024-12-31').expect(
      200,
    );
    await get(admin, '/analytics/team?from=2025-03-10&to=2025-03-10').expect(
      200,
    );
  });

  it('Calls counted by start time in range; outcomes breakdown sums to calls with an outcome (business: analytics)', async () => {
    await seedCall(mA.id, '2025-03-09T21:59:00Z', outNoAnswer); // Cairo 9 Mar 23:59: out
    await seedCall(mA.id, '2025-03-09T22:00:00Z', outInterested); // Cairo 10 Mar 00:00: in
    await seedCall(mA.id, '2025-03-11T10:00:00Z', outNoAnswer);
    await seedCall(mA.id, '2025-03-11T11:00:00Z', outNoAnswer);
    await seedCall(mA.id, '2025-03-12T21:59:00Z'); // no outcome: counted as a call
    await seedCall(mA.id, '2025-03-12T22:00:00Z', outNoAnswer); // Cairo 13 Mar: out

    const s = await memberStats(admin, mA.id);
    expect(s.calls).toBe(4);
    const withOutcome = s.outcomes.reduce((n, o) => n + o.count, 0);
    expect(withOutcome).toBe(3);
    expect(s.outcomes).toEqual([
      {
        outcomeId: outInterested,
        label: `${run} Interested`,
        count: 1,
      },
      { outcomeId: outNoAnswer, label: `${run} No answer`, count: 2 },
    ]);
    expect(s.byDay).toEqual([
      { date: '2025-03-10', calls: 1 },
      { date: '2025-03-11', calls: 2 },
      { date: '2025-03-12', calls: 1 },
    ]);
    expect(s.interestedOwners).toBe(1);

    // Labels follow the caller's language.
    await db.user.update({ where: { id: lead.id }, data: { language: 'ar' } });
    const ar = await memberStats(lead, mA.id);
    expect(ar.outcomes.map((o) => o.label)).toEqual([
      'Interested ع',
      'No answer ع',
    ]);
  });

  it('Reminders overdue = open and due before the range end (business)', async () => {
    // Range end = 2025-03-12T22:00Z.
    await seedReminder(mC.id, { dueAt: T('2025-03-12T20:00:00Z') }); // open, due before end: yes
    await seedReminder(mC.id, { dueAt: T('2025-03-12T23:00:00Z') }); // due after end: no
    await seedReminder(mC.id, { dueAt: T('2025-03-01T08:00:00Z') }); // long overdue, still open: yes
    const s = await memberStats(admin, mC.id);
    expect(s.remindersOverdue).toBe(2);
  });

  it('remindersOverdue = reminders still open at the range end whose due time is before it (contract: Stats, decided in review)', async () => {
    const before = (await memberStats(admin, mC.id)).remindersOverdue;
    // Done after the range end: it was still open at the end → counts.
    await seedReminder(mC.id, {
      dueAt: T('2025-03-11T08:00:00Z'),
      doneAt: T('2025-03-13T08:00:00Z'),
    });
    // Done before the range end → doesn't count.
    await seedReminder(mC.id, {
      dueAt: T('2025-03-11T08:00:00Z'),
      doneAt: T('2025-03-12T08:00:00Z'),
    });
    // Created after the range end → didn't exist then.
    await seedReminder(mC.id, {
      dueAt: T('2025-03-11T08:00:00Z'),
      createdAt: T('2025-03-14T08:00:00Z'),
    });
    const s = await memberStats(admin, mC.id);
    expect(s.remindersOverdue).toBe(before + 1);

    // A range ending in the future counts at now: due later today is not overdue yet.
    frozen = T('2026-10-23T09:00:00Z');
    const later = await seedReminder(mC.id, {
      dueAt: T('2026-10-23T15:00:00Z'),
      createdAt: T('2026-10-23T08:00:00Z'),
    });
    const earlier = await seedReminder(mC.id, {
      dueAt: T('2026-10-23T08:30:00Z'),
      createdAt: T('2026-10-23T08:00:00Z'),
    });
    const today = await memberStats(admin, mC.id, '');
    const all = await db.reminder.count({
      where: {
        memberId: mC.id,
        dueAt: { lt: frozen },
        createdAt: { lt: frozen },
        OR: [{ doneAt: null }, { doneAt: { gte: frozen } }],
      },
    });
    expect(today.remindersOverdue).toBe(all);
    expect(
      await db.reminder.count({ where: { id: { in: [later, earlier] } } }),
    ).toBe(2);
  });

  it('Reminders closed because their owner/listing was deleted are not counted as "done" (T6 closes them by setting doneAt — add a close reason or exclude them)', async () => {
    const ownerId = await seedOwner({ assignedToId: mC.id });
    const listingId = await seedListing({ assignedToId: mC.id });
    const viaOwner = await seedReminder(mC.id, {
      ownerId,
      dueAt: T('2025-03-15T08:00:00Z'),
    });
    const viaListing = await db.reminder.create({
      data: {
        kind: 'MANUAL',
        memberId: mC.id,
        listingId,
        dueAt: T('2025-03-15T08:00:00Z'),
        createdAt: T('2025-03-01T10:00:00Z'),
      },
    });
    const doneByHand = await seedReminder(mC.id, {
      dueAt: T('2025-03-15T08:00:00Z'),
      doneAt: T('2025-03-11T09:00:00Z'),
    });

    frozen = T('2025-03-11T10:00:00Z');
    await http()
      .delete(`/api/owners/${ownerId}`)
      .set(bearer(admin.token))
      .expect(200);
    await http()
      .delete(`/api/listings/${listingId}`)
      .set(bearer(admin.token))
      .expect(200);
    frozen = null;

    const closed = await db.reminder.findMany({
      where: { id: { in: [viaOwner, viaListing.id, doneByHand] } },
      select: { id: true, doneAt: true, closedByDelete: true },
    });
    expect(closed.every((r) => r.doneAt !== null)).toBe(true);
    expect(closed.find((r) => r.id === viaOwner)?.closedByDelete).toBe(true);
    expect(closed.find((r) => r.id === viaListing.id)?.closedByDelete).toBe(
      true,
    );
    expect(closed.find((r) => r.id === doneByHand)?.closedByDelete).toBe(false);

    const s = await memberStats(admin, mC.id);
    // remindersOverdue's "done before end" also holds for these (they were closed in R),
    // but only the one done by hand counts as done (plus the one seeded in an earlier case).
    const doneInR = await db.reminder.count({
      where: {
        memberId: mC.id,
        closedByDelete: false,
        doneAt: {
          gte: T('2025-03-09T22:00:00Z'),
          lt: T('2025-03-12T22:00:00Z'),
        },
      },
    });
    expect(s.remindersDone).toBe(doneInR);
    const withDeleted = await db.reminder.count({
      where: {
        memberId: mC.id,
        doneAt: {
          gte: T('2025-03-09T22:00:00Z'),
          lt: T('2025-03-12T22:00:00Z'),
        },
      },
    });
    expect(withDeleted - s.remindersDone).toBe(2);
  });

  it('Stats: assignedOwners and adsLive counted at the range end; adsTakenDown, interestedOwners, listingsCreated, remindersDone counted inside the range (contract: Stats)', async () => {
    // assignedOwners at the end (2025-03-12T22:00Z)
    const handedOver = await seedOwner({ assignedToId: mA.id }); // mB's at the end, mA's now
    await db.ownerAssignment.create({
      data: {
        ownerId: handedOver,
        fromMemberId: mB.id,
        toMemberId: mA.id,
        byId: admin.id,
        createdAt: T('2025-03-20T10:00:00Z'),
      },
    });
    const gained = await seedOwner({ assignedToId: mB.id }); // mA's at the end, mB's now
    await db.ownerAssignment.create({
      data: {
        ownerId: gained,
        fromMemberId: mA.id,
        toMemberId: mB.id,
        byId: admin.id,
        createdAt: T('2025-03-15T10:00:00Z'),
      },
    });
    await seedOwner({ assignedToId: mB.id }); // always mB's: yes
    await seedOwner({
      assignedToId: mB.id,
      createdAt: T('2025-03-15T10:00:00Z'),
    }); // added after the end: no
    await seedOwner({
      assignedToId: mB.id,
      deletedAt: T('2025-03-11T10:00:00Z'),
      deletedById: admin.id,
    }); // in the trash at the end: no
    await seedOwner({
      assignedToId: mB.id,
      deletedAt: T('2025-03-14T10:00:00Z'),
      deletedById: admin.id,
    }); // deleted after the end: yes

    // adsLive at the end, adsTakenDown inside
    await seedListing({
      assignedToId: mB.id,
      adStatus: 'LIVE',
      adPostedAt: T('2025-03-05T10:00:00Z'),
    }); // live: yes
    await seedListing({
      assignedToId: mB.id,
      adStatus: 'LIVE',
      adPostedAt: T('2025-03-15T10:00:00Z'),
    }); // posted after the end: no
    await seedListing({
      assignedToId: mB.id,
      adStatus: 'TAKEN_DOWN',
      adPostedAt: T('2025-03-01T10:00:00Z'),
      adTakenDownAt: T('2025-03-20T10:00:00Z'),
    }); // still live at the end: yes
    await seedListing({
      assignedToId: mB.id,
      adStatus: 'TAKEN_DOWN',
      adPostedAt: T('2025-03-01T10:00:00Z'),
      adTakenDownAt: T('2025-03-11T10:00:00Z'),
    }); // taken down inside: adsTakenDown
    await seedListing({
      assignedToId: mB.id,
      adStatus: 'TAKEN_DOWN',
      adPostedAt: T('2025-02-01T10:00:00Z'),
      adTakenDownAt: T('2025-03-05T10:00:00Z'),
    }); // taken down before: neither

    // listingsCreated inside
    await seedListing({
      createdById: mB.id,
      createdAt: T('2025-03-11T10:00:00Z'),
    });
    await seedListing({
      createdById: mB.id,
      createdAt: T('2025-03-13T10:00:00Z'),
    });

    // interestedOwners inside: one owner called twice counts once
    const keen = await seedOwner();
    await seedCall(mB.id, '2025-03-10T10:00:00Z', outInterested, keen);
    await seedCall(mB.id, '2025-03-11T10:00:00Z', outInterested, keen);
    await seedCall(
      mB.id,
      '2025-03-05T10:00:00Z',
      outInterested,
      await seedOwner(),
    );
    await seedCall(
      mB.id,
      '2025-03-11T12:00:00Z',
      outNoAnswer,
      await seedOwner(),
    );

    // remindersDone inside
    await seedReminder(mB.id, {
      dueAt: T('2025-03-11T08:00:00Z'),
      doneAt: T('2025-03-11T09:00:00Z'),
    });
    await seedReminder(mB.id, {
      dueAt: T('2025-03-11T08:00:00Z'),
      doneAt: T('2025-03-13T09:00:00Z'),
    });

    const s = await memberStats(admin, mB.id);
    expect(s).toMatchObject({
      assignedOwners: 3,
      adsLive: 2,
      adsTakenDown: 1,
      listingsCreated: 1,
      interestedOwners: 1,
      remindersDone: 1,
      calls: 3,
    });
    // mA lost `handedOver` after the end but held `gained` at it.
    const a = await memberStats(admin, mA.id);
    expect(a.assignedOwners).toBe(1);

    // Today the same owners count where they are now.
    const now = await memberStats(admin, mB.id, '');
    expect(now.assignedOwners).toBe(
      await db.owner.count({
        where: { assignedToId: mB.id, deletedAt: null },
      }),
    );
  });

  it('Deactivated member still appears for a range in which they worked (business: history stays)', async () => {
    await seedCall(mOff.id, '2025-03-11T10:00:00Z', outNoAnswer);
    const t = await team(admin);
    const off = t.members.find((m) => m.id === mOff.id);
    expect(off).toMatchObject({ active: false, calls: 1 });
    expect(t.members.some((m) => m.id === mIdle.id)).toBe(false);
    // Active members appear even with nothing in the range.
    const empty = await team(admin, 'from=2025-01-01&to=2025-01-01');
    expect(empty.members.some((m) => m.id === mC.id)).toBe(true);
    expect(empty.members.some((m) => m.id === mOff.id)).toBe(false);

    const one = await memberStats(admin, mOff.id);
    expect(one).toMatchObject({ id: mOff.id, active: false, calls: 1 });
    // A deactivated member who did nothing still answers (zeros), not 404.
    const idle = await memberStats(admin, mIdle.id);
    expect(idle).toMatchObject({ active: false, calls: 0 });
  });

  it('Team totals equal the sum of members (contract)', async () => {
    const t = await team(admin);
    const keys = [
      'calls',
      'remindersDone',
      'remindersOverdue',
      'assignedOwners',
      'interestedOwners',
      'listingsCreated',
      'adsLive',
      'adsTakenDown',
    ] as const;
    for (const key of keys) {
      expect(t.totals[key]).toBe(t.members.reduce((n, m) => n + m[key], 0));
    }
    const outcomeSum = (
      rows: { outcomes: StatsBody['outcomes'] }[],
      id: string,
    ) =>
      rows
        .flatMap((r) => r.outcomes)
        .filter((o) => o.outcomeId === id)
        .reduce((n, o) => n + o.count, 0);
    for (const id of [outInterested, outNoAnswer]) {
      expect(outcomeSum([t.totals], id)).toBe(outcomeSum(t.members, id));
    }
    // And each member row equals the member endpoint.
    const b = t.members.find((m) => m.id === mB.id);
    const { byDay: _d, range: _r, ...one } = await memberStats(admin, mB.id);
    expect(one).toEqual(b);
  });

  // ================================================================ generic checklist

  describe('generic checklist', () => {
    it('no token, expired token → 401', async () => {
      for (const path of ['/analytics/team', `/analytics/members/${mA.id}`]) {
        await http().get(`/api${path}`).expect(401);
        await http()
          .get(`/api${path}`)
          .set(bearer(signExpiredToken(admin.claims)))
          .expect(401);
      }
    });

    it('bad dates, unknown params, bad ids → 400; unknown member → 404', async () => {
      for (const q of [
        'from=2025-02-30',
        'to=abc',
        'from=2025-03-10T00:00:00Z',
        'from=10-03-2025',
        'foo=1',
      ]) {
        await get(admin, `/analytics/team?${q}`).expect(400);
      }
      await get(admin, '/analytics/members/not-a-uuid').expect(400);
      const res = await get(admin, `/analytics/members/${randomUUID()}`).expect(
        404,
      );
      expect(res.body.error).toBe('NOT_FOUND');
    });

    it('an empty range answers zeros, not an error', async () => {
      const s = await memberStats(
        admin,
        mA.id,
        'from=2020-01-01&to=2020-01-31',
      );
      expect(s).toMatchObject({
        calls: 0,
        outcomes: [],
        remindersDone: 0,
        listingsCreated: 0,
      });
      expect(s.byDay).toHaveLength(31);
      expect(s.byDay.every((d) => d.calls === 0)).toBe(true);
    });
  });
});
