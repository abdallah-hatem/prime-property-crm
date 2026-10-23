import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import type {
  LeadStatus,
  Prisma,
  PrismaClient,
  ReminderKind,
} from '@prisma/client';
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
 * T7 — calls, call outcomes, reminders, /me/today. Every edge case of the plan's T7 section is
 * an `it` named after it, then the generic checklist (validation, auth, pagination, deleted ids,
 * Arabic text), the reminder filters, the today screen and the 413 envelope. The spec makes its
 * own outcomes, so nothing depends on the seed.
 */

type Actor = Awaited<ReturnType<typeof createUserWithToken>>;

const e164 = (local: string) => `+20${local.slice(1)}`;
const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;
/** 12:00 Cairo on 22 Oct 2026 (UTC+3); that Cairo day ends at 2026-10-22T21:00Z. */
const NOON_CAIRO = new Date('2026-10-22T09:00:00.000Z');
const ARABIC_NOTE = 'المالك طلب الاتصال بعد الظهر 🙏';

describe('Calls, outcomes, reminders and today (e2e)', () => {
  let app: INestApplication;
  let db: PrismaClient;
  let frozen: Date | null = null;
  const http = () => request(app.getHttpServer());
  const run = `T7-${Date.now()}`;

  let admin: Actor;
  let memberA: Actor;
  let memberB: Actor;
  let lead: Actor; // analytics.view only
  const users: string[] = [];
  const roles: string[] = [];
  const outcomeIds: string[] = [];
  let outInterested: string;
  let outContacted: string;
  let outNotInterested: string;
  let outHidden: string;

  // ---------------------------------------------------------------- fixtures

  async function newMember(label: string): Promise<Actor> {
    const { memberRoleId } = await ensureBuiltInRoles(db);
    const actor = await createUserWithToken(db, label, memberRoleId, []);
    users.push(actor.id);
    return actor;
  }

  async function seedOwner(
    fields: Partial<Prisma.OwnerUncheckedCreateInput> & {
      phones?: string[];
    } = {},
  ): Promise<{ id: string; phones: string[] }> {
    const { phones = [randomLocalMobile()], ...rest } = fields;
    const owner = await db.owner.create({
      data: {
        name: `${run} owner`,
        createdById: admin.id,
        ...rest,
        phones: {
          create: phones.map((p, position) => ({ phone: e164(p), position })),
        },
      },
    });
    return { id: owner.id, phones };
  }

  async function seedListing(
    fields: Partial<Prisma.ListingUncheckedCreateInput> = {},
  ): Promise<string> {
    const listing = await db.listing.create({
      data: {
        purpose: 'SALE',
        type: 'APARTMENT',
        area: 'New Cairo',
        sizeSqm: 120,
        bedrooms: 3,
        price: 3_000_000,
        ownerName: `${run} listing owner`,
        ownerPhone: e164(randomLocalMobile()),
        createdById: admin.id,
        ...fields,
      },
    });
    return listing.id;
  }

  async function seedReminder(
    fields: Partial<Prisma.ReminderUncheckedCreateInput> & {
      kind?: ReminderKind;
    },
  ): Promise<string> {
    const reminder = await db.reminder.create({
      data: { dueAt: new Date(Date.now() + DAY), ...fields },
    });
    return reminder.id;
  }

  async function seedCall(
    ownerId: string | null,
    memberId: string,
    fields: Partial<Prisma.CallUncheckedCreateInput> = {},
  ): Promise<string> {
    const call = await db.call.create({
      data: {
        ownerId,
        ownerName: `${run} owner`,
        memberId,
        phone: e164(randomLocalMobile()),
        clientRequestId: randomUUID(),
        ...fields,
      },
    });
    return call.id;
  }

  async function newOutcome(
    labelEn: string,
    setsStatus: LeadStatus,
    hidden = false,
  ): Promise<string> {
    const o = await db.callOutcome.create({
      data: {
        labelEn: `${run} ${labelEn}`,
        labelAr: `${labelEn} بالعربي`,
        setsStatus,
        hidden,
        order: 900,
      },
    });
    outcomeIds.push(o.id);
    return o.id;
  }

  const startCall = (
    actor: Actor,
    ownerId: string,
    phone: string,
    clientRequestId: string = randomUUID(),
  ) =>
    http()
      .post(`/api/owners/${ownerId}/calls`)
      .set(bearer(actor.token))
      .send({ phone, clientRequestId });

  const setOutcome = (actor: Actor, callId: string, body: object) =>
    http()
      .post(`/api/calls/${callId}/outcome`)
      .set(bearer(actor.token))
      .send(body);

  const statusOf = async (ownerId: string) =>
    (await db.owner.findUniqueOrThrow({ where: { id: ownerId } })).status;

  const future = (ms = DAY) => new Date(Date.now() + ms).toISOString();

  // ---------------------------------------------------------------- lifecycle

  beforeAll(async () => {
    db = createTestDb();
    const { adminRoleId, memberRoleId } = await ensureBuiltInRoles(db);
    admin = await createUserWithToken(db, 't7-admin', adminRoleId, []);
    memberA = await createUserWithToken(db, 't7-a', memberRoleId, []);
    memberB = await createUserWithToken(db, 't7-b', memberRoleId, []);
    const leadRole = await db.role.create({
      data: { name: `${run} lead`, permissions: ['analytics.view'] },
    });
    roles.push(leadRole.id);
    lead = await createUserWithToken(db, 't7-lead', leadRole.id, [
      'analytics.view',
    ]);
    users.push(admin.id, memberA.id, memberB.id, lead.id);

    outInterested = await newOutcome('Interested', 'INTERESTED');
    outContacted = await newOutcome('No answer', 'CONTACTED');
    outNotInterested = await newOutcome('Not interested', 'NOT_INTERESTED');
    outHidden = await newOutcome('Old outcome', 'CONTACTED', true);

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
      await db.listing.deleteMany({ where: { createdById: where } });
      await db.owner.deleteMany({ where: { createdById: where } });
      await db.callOutcome.deleteMany({ where: { id: { in: outcomeIds } } });
      await db.user.deleteMany({ where: { id: where } });
      await db.role.deleteMany({ where: { id: { in: roles } } });
      await db.$disconnect();
    }
    await app?.close();
  });

  // ================================================================ calls

  describe('calls', () => {
    it("Member starts a call on another member's owner → 404 (invariant)", async () => {
      const { id, phones } = await seedOwner({ assignedToId: memberB.id });
      const res = await startCall(memberA, id, phones[0]).expect(404);
      expect(res.body).toMatchObject({ success: false, error: 'NOT_FOUND' });
      expect(await db.call.count({ where: { ownerId: id } })).toBe(0);
      // Not even the admin: calls are made on one's own owners only.
      await startCall(admin, id, phones[0]).expect(404);
    });

    it('Call on an unassigned owner → 404 (invariant)', async () => {
      const { id, phones } = await seedOwner();
      await startCall(memberA, id, phones[0]).expect(404);
      await startCall(admin, id, phones[0]).expect(404);
    });

    it('Start a call on a DO_NOT_CALL owner → 409; on a LISTED owner → 409 (invariant)', async () => {
      const dnc = await seedOwner({
        assignedToId: memberA.id,
        status: 'DO_NOT_CALL',
      });
      const listed = await seedOwner({
        assignedToId: memberA.id,
        status: 'LISTED',
      });
      const a = await startCall(memberA, dnc.id, dnc.phones[0]).expect(409);
      expect(a.body.error).toBe('DO_NOT_CALL');
      const b = await startCall(memberA, listed.id, listed.phones[0]).expect(
        409,
      );
      expect(b.body.error).toBe('OWNER_LISTED');
      expect(
        await db.call.count({
          where: { ownerId: { in: [dnc.id, listed.id] } },
        }),
      ).toBe(0);
    });

    it('Start a call with a phone not belonging to the owner → 400 (checklist: wrong value)', async () => {
      const { id } = await seedOwner({ assignedToId: memberA.id });
      const other = await seedOwner({ assignedToId: memberA.id });
      const res = await startCall(memberA, id, other.phones[0]).expect(400);
      expect(res.body.error).toBe('PHONE_NOT_OWNERS');
      // Not a phone at all is a validation error.
      await startCall(memberA, id, '12345').expect(400);
    });

    it("a call on any of the owner's phones, typed any way, is stored normalised and moves lastCallAt", async () => {
      const { id, phones } = await seedOwner({
        assignedToId: memberA.id,
        phones: [randomLocalMobile(), randomLocalMobile()],
      });
      const typed = `+20 ${phones[1].slice(1, 4)} ${phones[1].slice(4)}`;
      const res = await startCall(memberA, id, typed).expect(201);
      expect(res.body.data).toMatchObject({
        owner: { id },
        member: { id: memberA.id },
        phone: e164(phones[1]),
        outcome: null,
        note: null,
        outcomeAt: null,
      });
      const owner = await db.owner.findUniqueOrThrow({ where: { id } });
      expect(owner.lastCallAt?.toISOString()).toBe(res.body.data.startedAt);
      expect(owner.status).toBe('NEW');
    });

    it("Call stores the owner's name at creation (business: calls survive owner purge)", async () => {
      const { id, phones } = await seedOwner({
        assignedToId: memberA.id,
        name: 'أحمد عبد الله',
      });
      const res = await startCall(memberA, id, phones[0]).expect(201);
      const callId = res.body.data.id as string;
      expect(res.body.data.owner).toEqual({ id, name: 'أحمد عبد الله' });

      // Renamed, then purged: the call keeps the name it was made with.
      await db.owner.update({ where: { id }, data: { name: 'Renamed' } });
      await db.owner.delete({ where: { id } });
      const list = await http()
        .get('/api/calls')
        .set(bearer(memberA.token))
        .expect(200);
      const call = (
        list.body.data as { id: string; owner: { id: string | null } }[]
      ).find((c) => c.id === callId);
      expect(call?.owner).toEqual({ id: null, name: 'أحمد عبد الله' });
    });

    it('Double tap: two `POST /owners/:id/calls` with the same `clientRequestId` → one call (contract: idempotent call start)', async () => {
      const { id, phones } = await seedOwner({ assignedToId: memberA.id });
      const tap = randomUUID();
      const first = await startCall(memberA, id, phones[0], tap).expect(201);
      const second = await startCall(memberA, id, phones[0], tap).expect(201);
      expect(second.body.data.id).toBe(first.body.data.id);

      // Two taps at the same moment.
      const race = randomUUID();
      const [x, y] = await Promise.all([
        startCall(memberA, id, phones[0], race),
        startCall(memberA, id, phones[0], race),
      ]);
      expect([x.status, y.status]).toEqual([201, 201]);
      expect(x.body.data.id).toBe(y.body.data.id);
      expect(await db.call.count({ where: { ownerId: id } })).toBe(2);

      // The same id on another owner is refused; another member may reuse it.
      const other = await seedOwner({ assignedToId: memberA.id });
      const reused = await startCall(memberA, other.id, other.phones[0], tap);
      expect(reused.status).toBe(409);
      expect(reused.body.error).toBe('REQUEST_ID_REUSED');
      const bOwner = await seedOwner({ assignedToId: memberB.id });
      await startCall(memberB, bOwner.id, bOwner.phones[0], tap).expect(201);
    });

    it('Calls have no update/delete endpoints (invariant)', async () => {
      const { id } = await seedOwner({ assignedToId: memberA.id });
      const callId = await seedCall(id, memberA.id);
      for (const req of [
        () => http().patch(`/api/calls/${callId}`),
        () => http().put(`/api/calls/${callId}`),
        () => http().delete(`/api/calls/${callId}`),
        () => http().patch(`/api/calls/${callId}/outcome`),
        () => http().delete(`/api/calls/${callId}/outcome`),
      ]) {
        const res = await req().set(bearer(admin.token)).send({});
        expect(res.status).toBe(404);
      }
      expect(await db.call.count({ where: { id: callId } })).toBe(1);
    });
  });

  // ================================================================ outcomes on calls

  describe('setting an outcome', () => {
    it("Set outcome → owner status becomes the outcome's mapped status (business: outcome sets status)", async () => {
      const { id, phones } = await seedOwner({ assignedToId: memberA.id });
      const call = await startCall(memberA, id, phones[0]).expect(201);
      const res = await setOutcome(memberA, call.body.data.id, {
        outcomeId: outInterested,
        note: ARABIC_NOTE,
      }).expect(200);
      expect(res.body.data).toMatchObject({
        id: call.body.data.id,
        outcome: {
          id: outInterested,
          label: `${run} Interested`,
          setsStatus: 'INTERESTED',
        },
        note: ARABIC_NOTE,
      });
      expect(res.body.data.outcomeAt).not.toBeNull();
      expect(await statusOf(id)).toBe('INTERESTED');

      // The owner row shows it as its last call.
      const owner = await http()
        .get(`/api/owners/${id}`)
        .set(bearer(memberA.token))
        .expect(200);
      expect(owner.body.data.lastCall.outcome.id).toBe(outInterested);
    });

    it("outcome labels come back in the caller's stored language", async () => {
      const arabic = await newMember('t7-ar');
      await db.user.update({
        where: { id: arabic.id },
        data: { language: 'ar' },
      });
      const { id, phones } = await seedOwner({ assignedToId: arabic.id });
      const call = await startCall(arabic, id, phones[0]).expect(201);
      const res = await setOutcome(arabic, call.body.data.id, {
        outcomeId: outContacted,
      }).expect(200);
      expect(res.body.data.outcome.label).toBe('No answer بالعربي');
      const outcomes = await http()
        .get('/api/call-outcomes')
        .set(bearer(arabic.token))
        .expect(200);
      expect(
        (outcomes.body.data as { id: string }[]).some(
          (o) => o.id === outContacted,
        ),
      ).toBe(true);
    });

    it('Set outcome twice → 409 OUTCOME_ALREADY_SET; call unchanged (business: exactly one outcome)', async () => {
      const { id, phones } = await seedOwner({ assignedToId: memberA.id });
      const call = await startCall(memberA, id, phones[0]).expect(201);
      const callId = call.body.data.id as string;
      await setOutcome(memberA, callId, {
        outcomeId: outContacted,
        note: 'first',
      }).expect(200);
      const before = await db.call.findUniqueOrThrow({ where: { id: callId } });

      const again = await setOutcome(memberA, callId, {
        outcomeId: outInterested,
        note: 'second',
      }).expect(409);
      expect(again.body.error).toBe('OUTCOME_ALREADY_SET');
      const after = await db.call.findUniqueOrThrow({ where: { id: callId } });
      expect(after).toEqual(before);
      expect(await statusOf(id)).toBe('CONTACTED');

      // Two at once: exactly one wins.
      const call2 = await startCall(memberA, id, phones[0]).expect(201);
      const results = await Promise.all([
        setOutcome(memberA, call2.body.data.id, { outcomeId: outContacted }),
        setOutcome(memberA, call2.body.data.id, { outcomeId: outInterested }),
      ]);
      expect(results.map((r) => r.status).sort()).toEqual([200, 409]);
    });

    it('Another member sets the outcome on my call → 404 (role)', async () => {
      const { id, phones } = await seedOwner({ assignedToId: memberA.id });
      const call = await startCall(memberA, id, phones[0]).expect(201);
      for (const actor of [memberB, admin]) {
        await setOutcome(actor, call.body.data.id, {
          outcomeId: outContacted,
        }).expect(404);
      }
      expect(
        (await db.call.findUniqueOrThrow({ where: { id: call.body.data.id } }))
          .outcomeId,
      ).toBeNull();
    });

    it('Hidden outcome → 400 OUTCOME_HIDDEN (business: hidden outcomes)', async () => {
      const { id, phones } = await seedOwner({ assignedToId: memberA.id });
      const call = await startCall(memberA, id, phones[0]).expect(201);
      const res = await setOutcome(memberA, call.body.data.id, {
        outcomeId: outHidden,
      }).expect(400);
      expect(res.body.error).toBe('OUTCOME_HIDDEN');
      // An unknown outcome is a 404.
      await setOutcome(memberA, call.body.data.id, {
        outcomeId: randomUUID(),
      }).expect(404);
      expect(await statusOf(id)).toBe('NEW');
    });

    it('Outcome with reminder in the past → 400, and neither the outcome nor the reminder saved (checklist: half-applied)', async () => {
      const { id, phones } = await seedOwner({ assignedToId: memberA.id });
      const call = await startCall(memberA, id, phones[0]).expect(201);
      const res = await setOutcome(memberA, call.body.data.id, {
        outcomeId: outInterested,
        note: 'should not stick',
        reminder: { dueAt: new Date(Date.now() - MINUTE).toISOString() },
      }).expect(400);
      expect(res.body.error).toBe('REMINDER_IN_PAST');
      const stored = await db.call.findUniqueOrThrow({
        where: { id: call.body.data.id },
      });
      expect(stored).toMatchObject({ outcomeId: null, note: null });
      expect(await statusOf(id)).toBe('NEW');
      expect(await db.reminder.count({ where: { ownerId: id } })).toBe(0);
    });

    it("an outcome with a reminder saves both; the reminder is the owner's member's", async () => {
      const { id, phones } = await seedOwner({ assignedToId: memberA.id });
      const call = await startCall(memberA, id, phones[0]).expect(201);
      const dueAt = future(2 * DAY);
      await setOutcome(memberA, call.body.data.id, {
        outcomeId: outContacted,
        reminder: { dueAt, note: ARABIC_NOTE },
      }).expect(200);
      const reminders = await db.reminder.findMany({ where: { ownerId: id } });
      expect(reminders).toHaveLength(1);
      expect(reminders[0]).toMatchObject({
        kind: 'MANUAL',
        memberId: memberA.id,
        note: ARABIC_NOTE,
        doneAt: null,
      });
      expect(reminders[0].dueAt.toISOString()).toBe(dueAt);
    });

    it('Outcome on a call whose owner became LISTED meanwhile → outcome saved, status stays LISTED (invariant: Listed only through a listing)', async () => {
      const { id, phones } = await seedOwner({ assignedToId: memberA.id });
      const call = await startCall(memberA, id, phones[0]).expect(201);
      await db.owner.update({ where: { id }, data: { status: 'LISTED' } });
      const res = await setOutcome(memberA, call.body.data.id, {
        outcomeId: outNotInterested,
      }).expect(200);
      expect(res.body.data.outcome.id).toBe(outNotInterested);
      expect(await statusOf(id)).toBe('LISTED');
    });

    it("Outcome set on an older call after a newer call already has one → owner status keeps the newer call's status (business: latest call sets status)", async () => {
      const { id, phones } = await seedOwner({ assignedToId: memberA.id });
      frozen = new Date(Date.now() - HOUR);
      const older = await startCall(memberA, id, phones[0]).expect(201);
      frozen = null;
      const newer = await startCall(memberA, id, phones[0]).expect(201);
      await setOutcome(memberA, newer.body.data.id, {
        outcomeId: outInterested,
      }).expect(200);
      expect(await statusOf(id)).toBe('INTERESTED');

      await setOutcome(memberA, older.body.data.id, {
        outcomeId: outNotInterested,
      }).expect(200);
      expect(await statusOf(id)).toBe('INTERESTED');
    });

    it('a late outcome on the newest call still sets the status', async () => {
      const { id, phones } = await seedOwner({ assignedToId: memberA.id });
      frozen = new Date(Date.now() - HOUR);
      const older = await startCall(memberA, id, phones[0]).expect(201);
      frozen = null;
      const newer = await startCall(memberA, id, phones[0]).expect(201);
      await setOutcome(memberA, older.body.data.id, {
        outcomeId: outNotInterested,
      }).expect(200);
      expect(await statusOf(id)).toBe('NOT_INTERESTED');
      await setOutcome(memberA, newer.body.data.id, {
        outcomeId: outInterested,
      }).expect(200);
      expect(await statusOf(id)).toBe('INTERESTED');
    });

    it("an outcome on a deleted owner's call is saved without a status change; its reminder is refused (404)", async () => {
      const { id, phones } = await seedOwner({ assignedToId: memberA.id });
      const call = await startCall(memberA, id, phones[0]).expect(201);
      await db.owner.update({
        where: { id },
        data: { deletedAt: new Date(), deletedById: admin.id },
      });
      await setOutcome(memberA, call.body.data.id, {
        outcomeId: outInterested,
        reminder: { dueAt: future() },
      }).expect(404);
      await setOutcome(memberA, call.body.data.id, {
        outcomeId: outInterested,
      }).expect(200);
      expect(await statusOf(id)).toBe('NEW');
    });
  });

  // ================================================================ GET /calls

  describe('GET /calls', () => {
    it("`GET /calls` as member with another member's `memberId` or `ownerId` → only own calls returned (invariant)", async () => {
      const bOwner = await seedOwner({ assignedToId: memberB.id });
      const bCall = await seedCall(bOwner.id, memberB.id);
      const aOwner = await seedOwner({ assignedToId: memberA.id });
      const aCall = await seedCall(aOwner.id, memberA.id);

      for (const query of [{ memberId: memberB.id }, { ownerId: bOwner.id }]) {
        const res = await http()
          .get('/api/calls')
          .query(query)
          .set(bearer(memberA.token))
          .expect(200);
        const rows = res.body.data as { id: string; member: { id: string } }[];
        expect(rows.map((r) => r.id)).not.toContain(bCall);
        expect(rows.every((r) => r.member.id === memberA.id)).toBe(true);
      }
      // analytics.view reads anyone's.
      const asLead = await http()
        .get('/api/calls')
        .query({ memberId: memberB.id, ownerId: bOwner.id })
        .set(bearer(lead.token))
        .expect(200);
      expect(asLead.body.data.map((c: { id: string }) => c.id)).toEqual([
        bCall,
      ]);
      const own = await http()
        .get('/api/calls')
        .query({ ownerId: aOwner.id })
        .set(bearer(memberA.token))
        .expect(200);
      expect(own.body.data.map((c: { id: string }) => c.id)).toEqual([aCall]);
    });

    it('filters: outcome, missingOutcome, from/to (Cairo days); newest first; pagination', async () => {
      const m = await newMember('t7-calls');
      const { id } = await seedOwner({ assignedToId: m.id });
      const day1 = new Date('2026-10-20T09:00:00Z');
      const day2 = new Date('2026-10-21T09:00:00Z');
      const withOutcome = await seedCall(id, m.id, {
        startedAt: day1,
        outcomeId: outContacted,
        outcomeAt: day1,
      });
      const missing = await seedCall(id, m.id, { startedAt: day2 });

      const get = async (query: object) =>
        (
          await http()
            .get('/api/calls')
            .query(query)
            .set(bearer(m.token))
            .expect(200)
        ).body;

      expect((await get({})).data.map((c: { id: string }) => c.id)).toEqual([
        missing,
        withOutcome,
      ]);
      expect(
        (await get({ missingOutcome: true })).data.map(
          (c: { id: string }) => c.id,
        ),
      ).toEqual([missing]);
      expect(
        (await get({ missingOutcome: false })).data.map(
          (c: { id: string }) => c.id,
        ),
      ).toEqual([withOutcome]);
      expect(
        (await get({ outcomeId: outContacted })).data.map(
          (c: { id: string }) => c.id,
        ),
      ).toEqual([withOutcome]);
      expect(
        (await get({ from: '2026-10-21', to: '2026-10-21' })).data.map(
          (c: { id: string }) => c.id,
        ),
      ).toEqual([missing]);
      const page = await get({ limit: 1 });
      expect(page.meta).toMatchObject({ total: 2, hasNextPage: true });
      expect((await get({ page: 3 })).data).toEqual([]);
      await http()
        .get('/api/calls')
        .query({ from: '2026-10-22', to: '2026-10-21' })
        .set(bearer(m.token))
        .expect(400);
    });
  });

  // ================================================================ call outcomes

  describe('call outcomes', () => {
    it('Outcome creating `setsStatus: LISTED` → 400 (business)', async () => {
      const res = await http()
        .post('/api/call-outcomes')
        .set(bearer(admin.token))
        .send({ labelEn: `${run} x`, labelAr: 'س', setsStatus: 'LISTED' })
        .expect(400);
      expect(res.body.error).toBe('VALIDATION_FAILED');
      expect(
        await db.callOutcome.count({ where: { labelEn: `${run} x` } }),
      ).toBe(0);
    });

    it('`PATCH /call-outcomes/:id` with `setsStatus: LISTED` → 400 (business)', async () => {
      const id = await newOutcome('patch-listed', 'CONTACTED');
      await http()
        .patch(`/api/call-outcomes/${id}`)
        .set(bearer(admin.token))
        .send({ setsStatus: 'LISTED' })
        .expect(400);
      expect(
        (await db.callOutcome.findUniqueOrThrow({ where: { id } })).setsStatus,
      ).toBe('CONTACTED');
    });

    it('Delete an outcome in use → 409 OUTCOME_IN_USE; rename/hide in use → OK (business)', async () => {
      const id = await newOutcome('in-use', 'CONTACTED');
      const { id: ownerId } = await seedOwner({ assignedToId: memberA.id });
      await seedCall(ownerId, memberA.id, {
        outcomeId: id,
        outcomeAt: new Date(),
      });

      const del = await http()
        .delete(`/api/call-outcomes/${id}`)
        .set(bearer(admin.token))
        .expect(409);
      expect(del.body.error).toBe('OUTCOME_IN_USE');

      const patched = await http()
        .patch(`/api/call-outcomes/${id}`)
        .set(bearer(admin.token))
        .send({
          labelEn: `${run} renamed`,
          labelAr: 'معاد تسميته',
          hidden: true,
        })
        .expect(200);
      expect(patched.body.data).toMatchObject({
        id,
        labelEn: `${run} renamed`,
        labelAr: 'معاد تسميته',
        hidden: true,
        inUse: true,
      });

      // An unused outcome deletes; a second delete is a 404.
      const unused = await newOutcome('unused', 'NEW');
      const ok = await http()
        .delete(`/api/call-outcomes/${unused}`)
        .set(bearer(admin.token))
        .expect(200);
      expect(ok.body).toMatchObject({ success: true, data: null });
      await http()
        .delete(`/api/call-outcomes/${unused}`)
        .set(bearer(admin.token))
        .expect(404);
      await http()
        .patch(`/api/call-outcomes/${unused}`)
        .set(bearer(admin.token))
        .send({ hidden: true })
        .expect(404);
    });

    it('Member POST/PATCH/DELETE on `/call-outcomes` or `includeHidden=true` → 403 (role)', async () => {
      const id = await newOutcome('member-403', 'CONTACTED');
      const as = bearer(memberA.token);
      await http()
        .post('/api/call-outcomes')
        .set(as)
        .send({ labelEn: 'x', labelAr: 'س', setsStatus: 'NEW' })
        .expect(403);
      await http()
        .patch(`/api/call-outcomes/${id}`)
        .set(as)
        .send({ hidden: true })
        .expect(403);
      await http().delete(`/api/call-outcomes/${id}`).set(as).expect(403);
      await http()
        .get('/api/call-outcomes')
        .query({ includeHidden: true })
        .set(as)
        .expect(403);

      // Without the flag a member sees the visible outcomes only.
      const list = await http().get('/api/call-outcomes').set(as).expect(200);
      const ids = (list.body.data as { id: string }[]).map((o) => o.id);
      expect(ids).toContain(id);
      expect(ids).not.toContain(outHidden);
      const all = await http()
        .get('/api/call-outcomes')
        .query({ includeHidden: true, limit: 100 })
        .set(bearer(admin.token))
        .expect(200);
      expect((all.body.data as { id: string }[]).map((o) => o.id)).toContain(
        outHidden,
      );
    });

    it('Creating, renaming, hiding or reordering a call outcome writes an activity entry (business: activity log)', async () => {
      const outcomeAdmin = await createUserWithToken(
        db,
        't7-settings',
        (await ensureBuiltInRoles(db)).adminRoleId,
        [],
      );
      users.push(outcomeAdmin.id);
      const as = bearer(outcomeAdmin.token);
      const created = await http()
        .post('/api/call-outcomes')
        .set(as)
        .send({
          labelEn: `  ${run} Asked for WhatsApp  `,
          labelAr: 'طلب واتساب',
          setsStatus: 'CALL_BACK',
        })
        .expect(201);
      const id = created.body.data.id as string;
      outcomeIds.push(id);
      expect(created.body.data).toMatchObject({
        labelEn: `${run} Asked for WhatsApp`,
        setsStatus: 'CALL_BACK',
        hidden: false,
        inUse: false,
      });
      for (const patch of [
        { labelEn: `${run} WhatsApp` },
        { hidden: true },
        { order: 1 },
      ]) {
        await http()
          .patch(`/api/call-outcomes/${id}`)
          .set(as)
          .send(patch)
          .expect(200);
      }
      // Nothing changed: no entry.
      await http()
        .patch(`/api/call-outcomes/${id}`)
        .set(as)
        .send({ order: 1 })
        .expect(200);

      const entries = await db.activityEntry.findMany({
        where: { actorId: outcomeAdmin.id, type: 'OUTCOME_UPDATE' },
        orderBy: { createdAt: 'asc' },
      });
      expect(entries).toHaveLength(4);
      expect(entries.every((e) => e.targetId === id)).toBe(true);
      expect(entries[1].details).toMatchObject({
        changed: { labelEn: { to: `${run} WhatsApp` } },
      });

      await http().delete(`/api/call-outcomes/${id}`).set(as).expect(200);
      expect(
        await db.activityEntry.count({
          where: { actorId: outcomeAdmin.id, type: 'OUTCOME_UPDATE' },
        }),
      ).toBe(5);
    });
  });

  // ================================================================ reminders

  describe('reminders', () => {
    const createReminder = (actor: Actor, body: object) =>
      http().post('/api/reminders').set(bearer(actor.token)).send(body);

    it("Reminder on someone else's owner → 404 (invariant)", async () => {
      const { id } = await seedOwner({ assignedToId: memberB.id });
      const unassigned = await seedOwner();
      await createReminder(memberA, { ownerId: id, dueAt: future() }).expect(
        404,
      );
      await createReminder(memberA, {
        ownerId: unassigned.id,
        dueAt: future(),
      }).expect(404);
      expect(
        await db.reminder.count({
          where: { ownerId: { in: [id, unassigned.id] } },
        }),
      ).toBe(0);
    });

    it('Reminder on a listing not assigned to me → 404 (invariant)', async () => {
      const listing = await seedListing({ assignedToId: memberB.id });
      await createReminder(memberA, {
        listingId: listing,
        dueAt: future(),
      }).expect(404);
      const own = await seedListing({ assignedToId: memberA.id });
      const res = await createReminder(memberA, {
        listingId: own,
        dueAt: future(),
        note: ARABIC_NOTE,
      }).expect(201);
      expect(res.body.data).toMatchObject({
        kind: 'MANUAL',
        owner: null,
        listing: { id: own },
        member: { id: memberA.id },
        note: ARABIC_NOTE,
        overdue: false,
        doneAt: null,
      });
    });

    it('Reminder with both ownerId and listingId, or neither → 400 (contract)', async () => {
      const { id } = await seedOwner({ assignedToId: memberA.id });
      const listing = await seedListing({ assignedToId: memberA.id });
      await createReminder(memberA, {
        ownerId: id,
        listingId: listing,
        dueAt: future(),
      }).expect(400);
      await createReminder(memberA, { dueAt: future() }).expect(400);
      expect(
        await db.reminder.count({
          where: { OR: [{ ownerId: id }, { listingId: listing }] },
        }),
      ).toBe(0);
    });

    it('a reminder due now or earlier → 400 REMINDER_IN_PAST', async () => {
      const { id } = await seedOwner({ assignedToId: memberA.id });
      frozen = NOON_CAIRO;
      const res = await createReminder(memberA, {
        ownerId: id,
        dueAt: NOON_CAIRO.toISOString(),
      }).expect(400);
      expect(res.body.error).toBe('REMINDER_IN_PAST');
      await createReminder(memberA, {
        ownerId: id,
        dueAt: '2026-10-22T12:00:01+03:00',
      }).expect(201);
    });

    it("Member can't read another member's reminders with `memberId` without `analytics.view` → 403 (role)", async () => {
      const { id } = await seedOwner({ assignedToId: memberB.id });
      const reminder = await seedReminder({
        ownerId: id,
        memberId: memberB.id,
      });
      await http()
        .get('/api/reminders')
        .query({ memberId: memberB.id })
        .set(bearer(memberA.token))
        .expect(403);
      const asLead = await http()
        .get('/api/reminders')
        .query({ memberId: memberB.id, limit: 20 })
        .set(bearer(lead.token))
        .expect(200);
      expect((asLead.body.data as { id: string }[]).map((r) => r.id)).toContain(
        reminder,
      );
      // Their own id needs nothing.
      await http()
        .get('/api/reminders')
        .query({ memberId: memberA.id })
        .set(bearer(memberA.token))
        .expect(200);
    });

    it("PATCH or done on another member's reminder → 404 (invariant)", async () => {
      const { id } = await seedOwner({ assignedToId: memberB.id });
      const reminder = await seedReminder({
        ownerId: id,
        memberId: memberB.id,
      });
      for (const actor of [memberA, admin]) {
        await http()
          .patch(`/api/reminders/${reminder}`)
          .set(bearer(actor.token))
          .send({ note: 'x' })
          .expect(404);
        await http()
          .post(`/api/reminders/${reminder}/done`)
          .set(bearer(actor.token))
          .expect(404);
      }
      const row = await db.reminder.findUniqueOrThrow({
        where: { id: reminder },
      });
      expect(row).toMatchObject({ note: null, doneAt: null });
    });

    it('PATCH a done reminder → 409 REMINDER_DONE (contract)', async () => {
      const { id } = await seedOwner({ assignedToId: memberA.id });
      const reminder = await seedReminder({
        ownerId: id,
        memberId: memberA.id,
        doneAt: new Date(),
      });
      const res = await http()
        .patch(`/api/reminders/${reminder}`)
        .set(bearer(memberA.token))
        .send({ dueAt: future() })
        .expect(409);
      expect(res.body.error).toBe('REMINDER_DONE');
    });

    it('PATCH `dueAt` of an AD_TAKE_DOWN reminder → 400 SYSTEM_REMINDER (business)', async () => {
      const listing = await seedListing({ assignedToId: memberA.id });
      const dueAt = new Date(Date.now() - HOUR);
      const reminder = await seedReminder({
        listingId: listing,
        memberId: memberA.id,
        kind: 'AD_TAKE_DOWN',
        dueAt,
      });
      const res = await http()
        .patch(`/api/reminders/${reminder}`)
        .set(bearer(memberA.token))
        .send({ dueAt: future() })
        .expect(400);
      expect(res.body.error).toBe('SYSTEM_REMINDER');
      // Its note can change; a check-in can be moved.
      await http()
        .patch(`/api/reminders/${reminder}`)
        .set(bearer(memberA.token))
        .send({ note: 'وكيل العقار أكد' })
        .expect(200);
      expect(
        (await db.reminder.findUniqueOrThrow({ where: { id: reminder } }))
          .dueAt,
      ).toEqual(dueAt);
      const checkIn = await seedReminder({
        listingId: listing,
        memberId: memberA.id,
        kind: 'AD_CHECK_IN',
      });
      await http()
        .patch(`/api/reminders/${checkIn}`)
        .set(bearer(memberA.token))
        .send({ dueAt: future(3 * DAY) })
        .expect(200);
    });

    it('Mark an AD_TAKE_DOWN or AD_CHECK_IN reminder done manually → 400 SYSTEM_REMINDER (business: take-down closes only on Taken down)', async () => {
      const listing = await seedListing({ assignedToId: memberA.id });
      for (const kind of ['AD_TAKE_DOWN', 'AD_CHECK_IN'] as const) {
        const reminder = await seedReminder({
          listingId: listing,
          memberId: memberA.id,
          kind,
        });
        const res = await http()
          .post(`/api/reminders/${reminder}/done`)
          .set(bearer(memberA.token))
          .expect(400);
        expect(res.body.error).toBe('SYSTEM_REMINDER');
        expect(
          (await db.reminder.findUniqueOrThrow({ where: { id: reminder } }))
            .doneAt,
        ).toBeNull();
      }
    });

    it('PATCH and done on an own manual reminder; done twice keeps the first time', async () => {
      const { id } = await seedOwner({ assignedToId: memberA.id });
      const created = await createReminder(memberA, {
        ownerId: id,
        dueAt: future(),
        note: 'first',
      }).expect(201);
      const rid = created.body.data.id as string;
      const newDue = future(2 * DAY);
      const patched = await http()
        .patch(`/api/reminders/${rid}`)
        .set(bearer(memberA.token))
        .send({ dueAt: newDue, note: null })
        .expect(200);
      expect(patched.body.data).toMatchObject({ dueAt: newDue, note: null });
      await http()
        .patch(`/api/reminders/${rid}`)
        .set(bearer(memberA.token))
        .send({ dueAt: new Date(Date.now() - MINUTE).toISOString() })
        .expect(400);

      const done = await http()
        .post(`/api/reminders/${rid}/done`)
        .set(bearer(memberA.token))
        .expect(200);
      expect(done.body.data.doneAt).not.toBeNull();
      const again = await http()
        .post(`/api/reminders/${rid}/done`)
        .set(bearer(memberA.token))
        .expect(200);
      expect(again.body.data.doneAt).toBe(done.body.data.doneAt);
    });

    it('Overdue reminders listed first in today and reminders list (business: overdue on top)', async () => {
      const m = await newMember('t7-order');
      const { id } = await seedOwner({ assignedToId: m.id });
      frozen = NOON_CAIRO;
      const done = await seedReminder({
        ownerId: id,
        memberId: m.id,
        dueAt: new Date(NOON_CAIRO.getTime() - 3 * DAY),
        doneAt: new Date(NOON_CAIRO.getTime() - 2 * DAY),
      });
      const later = await seedReminder({
        ownerId: id,
        memberId: m.id,
        dueAt: new Date(NOON_CAIRO.getTime() + 3 * DAY),
      });
      const todayLater = await seedReminder({
        ownerId: id,
        memberId: m.id,
        dueAt: new Date(NOON_CAIRO.getTime() + 2 * HOUR),
      });
      const overdue = await seedReminder({
        ownerId: id,
        memberId: m.id,
        dueAt: new Date(NOON_CAIRO.getTime() - HOUR),
      });

      const list = await http()
        .get('/api/reminders')
        .set(bearer(m.token))
        .expect(200);
      expect(list.body.data.map((r: { id: string }) => r.id)).toEqual([
        overdue,
        todayLater,
        later,
        done,
      ]);
      expect(list.body.data[0].overdue).toBe(true);

      const today = await http()
        .get('/api/me/today')
        .set(bearer(m.token))
        .expect(200);
      expect(Object.keys(today.body.data)[1]).toBe('overdue');
      expect(today.body.data.overdue.map((r: { id: string }) => r.id)).toEqual([
        overdue,
      ]);
      expect(today.body.data.dueToday.map((r: { id: string }) => r.id)).toEqual(
        [todayLater],
      );
    });

    it('filters: state, when, kind; unassigned for owners.assign', async () => {
      const m = await newMember('t7-filters');
      const { id } = await seedOwner({ assignedToId: m.id });
      const listing = await seedListing({ assignedToId: m.id });
      frozen = NOON_CAIRO;
      const at = (ms: number) => new Date(NOON_CAIRO.getTime() + ms);
      const overdue = await seedReminder({
        ownerId: id,
        memberId: m.id,
        dueAt: at(-HOUR),
      });
      const today = await seedReminder({
        ownerId: id,
        memberId: m.id,
        dueAt: at(8 * HOUR), // 20:00 Cairo
      });
      const upcoming = await seedReminder({
        ownerId: id,
        memberId: m.id,
        dueAt: at(13 * HOUR), // 01:00 Cairo tomorrow
      });
      const done = await seedReminder({
        ownerId: id,
        memberId: m.id,
        dueAt: at(-2 * HOUR),
        doneAt: at(-HOUR),
      });
      const checkIn = await seedReminder({
        listingId: listing,
        memberId: m.id,
        kind: 'AD_CHECK_IN',
        dueAt: at(2 * DAY),
      });

      const ids = async (query: object) =>
        (
          await http()
            .get('/api/reminders')
            .query(query)
            .set(bearer(m.token))
            .expect(200)
        ).body.data.map((r: { id: string }) => r.id);

      expect(await ids({ when: 'overdue' })).toEqual([overdue]);
      expect(await ids({ when: 'today' })).toEqual([today]);
      expect(await ids({ when: 'upcoming' })).toEqual([upcoming, checkIn]);
      expect(await ids({ state: 'done' })).toEqual([done]);
      expect(await ids({ state: 'open', kind: 'MANUAL' })).toEqual([
        overdue,
        today,
        upcoming,
      ]);
      expect(await ids({ kind: 'AD_CHECK_IN' })).toEqual([checkIn]);

      // Unassigned reminders: owners.assign only, and they don't mix with memberId.
      await http()
        .get('/api/reminders')
        .query({ unassigned: true })
        .set(bearer(m.token))
        .expect(403);
      await http()
        .get('/api/reminders')
        .query({ unassigned: true, memberId: m.id })
        .set(bearer(admin.token))
        .expect(400);
    });

    it('reminders of a deleted owner are gone from lists and answer 404', async () => {
      const { id } = await seedOwner({ assignedToId: memberA.id });
      const reminder = await seedReminder({
        ownerId: id,
        memberId: memberA.id,
      });
      await db.owner.update({
        where: { id },
        data: { deletedAt: new Date(), deletedById: admin.id },
      });
      const list = await http()
        .get('/api/reminders')
        .query({ limit: 20 })
        .set(bearer(memberA.token))
        .expect(200);
      expect(list.body.data.map((r: { id: string }) => r.id)).not.toContain(
        reminder,
      );
      await http()
        .patch(`/api/reminders/${reminder}`)
        .set(bearer(memberA.token))
        .send({ note: 'x' })
        .expect(404);
      await http()
        .post(`/api/reminders/${reminder}/done`)
        .set(bearer(memberA.token))
        .expect(404);
      await createReminder(memberA, { ownerId: id, dueAt: future() }).expect(
        404,
      );
    });
  });

  // ================================================================ today

  describe('/me/today', () => {
    it('Call with no outcome appears in `/me/today.outcomeMissing` until set (business: outcome missing)', async () => {
      const m = await newMember('t7-missing');
      const { id, phones } = await seedOwner({ assignedToId: m.id });
      const call = await startCall(m, id, phones[0]).expect(201);
      const today = async () =>
        (await http().get('/api/me/today').set(bearer(m.token)).expect(200))
          .body.data;

      expect(
        (await today()).outcomeMissing.map((c: { id: string }) => c.id),
      ).toEqual([call.body.data.id]);
      await setOutcome(m, call.body.data.id, {
        outcomeId: outContacted,
      }).expect(200);
      expect((await today()).outcomeMissing).toEqual([]);
    });

    it('today: ad tasks, counts (Cairo day), only own reminders on live records', async () => {
      const m = await newMember('t7-today');
      const { id } = await seedOwner({ assignedToId: m.id });
      const listing = await seedListing({ assignedToId: m.id });
      frozen = NOON_CAIRO;
      const at = (ms: number) => new Date(NOON_CAIRO.getTime() + ms);

      const takeDown = await seedReminder({
        listingId: listing,
        memberId: m.id,
        kind: 'AD_TAKE_DOWN',
        dueAt: at(-DAY),
      });
      const checkInToday = await seedReminder({
        listingId: listing,
        memberId: m.id,
        kind: 'AD_CHECK_IN',
        dueAt: at(HOUR),
      });
      await seedReminder({
        listingId: listing,
        memberId: m.id,
        kind: 'AD_CHECK_IN',
        dueAt: at(3 * DAY), // not yet
      });
      await seedReminder({ ownerId: id, memberId: m.id, dueAt: at(2 * DAY) });
      // Someone else's, and a done one: not counted.
      const other = await seedOwner({ assignedToId: memberB.id });
      await seedReminder({ ownerId: other.id, memberId: memberB.id });
      await seedReminder({
        ownerId: id,
        memberId: m.id,
        dueAt: at(-HOUR),
        doneAt: at(-HOUR),
      });

      // Calls: two today (Cairo), one yesterday evening Cairo time.
      await seedCall(id, m.id, { startedAt: at(-11 * HOUR) }); // 01:00 Cairo
      await seedCall(id, m.id, { startedAt: at(-HOUR) });
      await seedCall(id, m.id, {
        startedAt: at(-13 * HOUR), // 23:00 Cairo the day before
        outcomeId: outContacted,
        outcomeAt: at(-13 * HOUR),
      });

      const res = await http()
        .get('/api/me/today')
        .set(bearer(m.token))
        .expect(200);
      const data = res.body.data;
      expect(data.adTasks.map((r: { id: string }) => r.id)).toEqual([
        takeDown,
        checkInToday,
      ]);
      expect(data.adTasks[0]).toMatchObject({
        kind: 'AD_TAKE_DOWN',
        overdue: true,
        listing: { id: listing },
      });
      expect(data.overdue).toEqual([]);
      expect(data.dueToday).toEqual([]);
      expect(data.outcomeMissing).toHaveLength(2);
      expect(data.counts).toEqual({
        overdue: 0,
        dueToday: 0,
        outcomeMissing: 2,
        adTasks: 2,
        callsToday: 2,
        remindersOpen: 4,
      });
    });
  });

  // ================================================================ generic checklist

  describe('generic checklist', () => {
    const ID = '7f1c2a9e-5b8d-4c3e-9a1f-2b3c4d5e6f70';
    const routes: [string, string][] = [
      ['post', `/api/owners/${ID}/calls`],
      ['post', `/api/calls/${ID}/outcome`],
      ['get', '/api/calls'],
      ['get', '/api/call-outcomes'],
      ['post', '/api/call-outcomes'],
      ['patch', `/api/call-outcomes/${ID}`],
      ['delete', `/api/call-outcomes/${ID}`],
      ['get', '/api/reminders'],
      ['post', '/api/reminders'],
      ['patch', `/api/reminders/${ID}`],
      ['post', `/api/reminders/${ID}/done`],
      ['get', '/api/me/today'],
    ];

    it('no token, an expired token → 401 on every route', async () => {
      const expired = signExpiredToken(memberA.claims);
      for (const [method, path] of routes) {
        const call = (
          http() as unknown as Record<string, (p: string) => request.Test>
        )[method](path);
        const res = await call.send({});
        expect({ path, status: res.status }).toEqual({ path, status: 401 });
        const call2 = (
          http() as unknown as Record<string, (p: string) => request.Test>
        )[method](path);
        const res2 = await call2.set(bearer(expired)).send({});
        expect({ path, status: res2.status }).toEqual({ path, status: 401 });
      }
    });

    it('validation: missing, extra, wrong-type and null fields, bad ids → 400', async () => {
      const { id, phones } = await seedOwner({ assignedToId: memberA.id });
      const as = bearer(memberA.token);
      const bad: [string, string, object][] = [
        ['post', `/api/owners/${id}/calls`, {}],
        ['post', `/api/owners/${id}/calls`, { phone: phones[0] }],
        [
          'post',
          `/api/owners/${id}/calls`,
          { phone: phones[0], clientRequestId: randomUUID(), memberId: ID },
        ],
        [
          'post',
          `/api/owners/${id}/calls`,
          { phone: 1001234567, clientRequestId: randomUUID() },
        ],
        ['post', '/api/owners/not-a-uuid/calls', {}],
        ['post', `/api/calls/${ID}/outcome`, {}],
        ['post', `/api/calls/${ID}/outcome`, { outcomeId: ID, note: null }],
        [
          'post',
          `/api/calls/${ID}/outcome`,
          { outcomeId: ID, reminder: { dueAt: 'tomorrow' } },
        ],
        ['post', '/api/reminders', { ownerId: id }],
        ['post', '/api/reminders', { ownerId: id, dueAt: future(), x: 1 }],
        ['post', '/api/reminders', { ownerId: id, dueAt: '2026-12-01' }],
        [
          'post',
          '/api/reminders',
          { ownerId: id, dueAt: future(), note: 'n'.repeat(2001) },
        ],
        ['patch', `/api/reminders/${ID}`, { dueAt: null }],
        ['patch', `/api/reminders/${ID}`, { kind: 'MANUAL' }],
        ['patch', '/api/reminders/abc', {}],
      ];
      for (const [method, path, body] of bad) {
        const res = await (
          http() as unknown as Record<string, (p: string) => request.Test>
        )
          [method](path)
          .set(as)
          .send(body);
        expect({ path, body, status: res.status }).toEqual({
          path,
          body,
          status: 400,
        });
      }
      const adminAs = bearer(admin.token);
      for (const body of [
        {},
        { labelEn: 'x', labelAr: 'س' },
        { labelEn: 'x', labelAr: 'س', setsStatus: 'MAYBE' },
        { labelEn: 'x', labelAr: 'س', setsStatus: 'NEW', order: 3 },
      ]) {
        await http()
          .post('/api/call-outcomes')
          .set(adminAs)
          .send(body)
          .expect(400);
      }
      for (const query of [
        { state: 'pending' },
        { when: 'yesterday' },
        { kind: 'OTHER' },
        { memberId: 'me' },
        { unassigned: 'yes' },
      ]) {
        await http().get('/api/reminders').query(query).set(as).expect(400);
      }
      for (const query of [
        { memberId: 'x' },
        { missingOutcome: 'maybe' },
        { from: '2026-02-30' },
        { to: 'today' },
        { sort: 'name' },
      ]) {
        await http().get('/api/calls').query(query).set(as).expect(400);
      }
    });

    it('pagination: page 0, limit over the cap, a page past the end, an empty result', async () => {
      const m = await newMember('t7-pages');
      const as = bearer(m.token);
      for (const path of ['/api/calls', '/api/reminders']) {
        await http().get(path).query({ page: 0 }).set(as).expect(400);
        await http().get(path).query({ limit: 21 }).set(as).expect(400);
        await http().get(path).query({ limit: 'x' }).set(as).expect(400);
        const empty = await http().get(path).set(as).expect(200);
        expect(empty.body).toMatchObject({
          data: [],
          meta: { total: 0, hasNextPage: false },
        });
      }
      await http()
        .get('/api/call-outcomes')
        .query({ limit: 101 })
        .set(as)
        .expect(400);
      const pastEnd = await http()
        .get('/api/call-outcomes')
        .query({ page: 999 })
        .set(as)
        .expect(200);
      expect(pastEnd.body.data).toEqual([]);
      const one = await http()
        .get('/api/call-outcomes')
        .query({ limit: 1 })
        .set(as)
        .expect(200);
      expect(one.body.meta).toMatchObject({ limit: 1, hasNextPage: true });
    });

    it('deleted ids → 404: a call on a trashed owner, an unknown call, reminder and outcome', async () => {
      const { id, phones } = await seedOwner({
        assignedToId: memberA.id,
        deletedAt: new Date(),
        deletedById: admin.id,
      });
      await startCall(memberA, id, phones[0]).expect(404);
      await setOutcome(memberA, randomUUID(), {
        outcomeId: outContacted,
      }).expect(404);
      await http()
        .patch(`/api/reminders/${randomUUID()}`)
        .set(bearer(memberA.token))
        .send({ note: 'x' })
        .expect(404);
      await http()
        .patch(`/api/call-outcomes/${randomUUID()}`)
        .set(bearer(admin.token))
        .send({ hidden: true })
        .expect(404);
    });

    it('a JSON body over the limit → 413 PAYLOAD_TOO_LARGE in the envelope, not 500', async () => {
      const { id } = await seedOwner({ assignedToId: memberA.id });
      const res = await http()
        .post('/api/reminders')
        .set(bearer(memberA.token))
        .set('Content-Type', 'application/json')
        .send(
          JSON.stringify({
            ownerId: id,
            dueAt: future(),
            note: 'x'.repeat(1_100_000),
          }),
        );
      expect(res.status).toBe(413);
      expect(res.body).toMatchObject({
        success: false,
        statusCode: 413,
        error: 'PAYLOAD_TOO_LARGE',
      });
    });
  });
});
