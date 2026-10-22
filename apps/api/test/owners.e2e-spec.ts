import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import type { LeadStatus, Prisma, PrismaClient } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { configureApp } from '../src/app.setup';
import { Clock } from '../src/common/providers/clock';
import { DatabaseService } from '../src/database/database.service';
import { AssignmentService } from '../src/domains/assignment/assignment.service';
import { createTestDb, randomLocalMobile } from './helpers';
import {
  bearer,
  createUserWithToken,
  ensureBuiltInRoles,
  signExpiredToken,
} from './helpers-auth';

/**
 * T6 — owners. Every edge case of the plan's T6 section is an `it` named after it, then the
 * generic checklist (validation, auth, pagination, search, Arabic text, deleted ids, phones),
 * the areas lookup, the timeline and the OWNER restore handler. Nothing depends on the seed
 * except the default call outcomes of the foundation.
 */

type Actor = Awaited<ReturnType<typeof createUserWithToken>>;

/** `010xxxxxxxx` → `+2010xxxxxxxx`. */
const e164 = (local: string) => `+20${local.slice(1)}`;
/** The same number typed the international way with spaces: `+20 100 123 4567`. */
const spaced = (local: string) =>
  `+20 ${local.slice(1, 4)} ${local.slice(4, 7)} ${local.slice(7)}`;

const HOUR = 3_600_000;
const DAY = 24 * HOUR;

describe('Owners (e2e)', () => {
  let app: INestApplication;
  let db: PrismaClient;
  let frozen: Date | null = null;
  const http = () => request(app.getHttpServer());
  const run = `T6-${Date.now()}`;

  let admin: Actor;
  let memberA: Actor;
  let memberB: Actor;
  let importer: Actor; // owners.import only
  let assigner: Actor; // owners.assign only
  let restorer: Actor; // owners.import + owners.viewAll, no trash.restore
  let inactive: Actor;
  const extraRoles: string[] = [];
  const users: string[] = [];
  let outcomeId: string;

  async function newMember(label: string): Promise<Actor> {
    const { memberRoleId } = await ensureBuiltInRoles(db);
    const actor = await createUserWithToken(db, label, memberRoleId, []);
    users.push(actor.id);
    return actor;
  }

  /** An owner written straight to the database (phones as local numbers). */
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
    fields: Partial<Prisma.ReminderUncheckedCreateInput>,
  ): Promise<string> {
    const reminder = await db.reminder.create({
      data: { dueAt: new Date(Date.now() + DAY), ...fields },
    });
    return reminder.id;
  }

  async function seedCall(
    ownerId: string,
    memberId: string,
    startedAt: Date,
  ): Promise<string> {
    const call = await db.call.create({
      data: {
        ownerId,
        ownerName: `${run} owner`,
        memberId,
        phone: e164(randomLocalMobile()),
        clientRequestId: randomUUID(),
        startedAt,
        outcomeId,
        outcomeAt: startedAt,
      },
    });
    return call.id;
  }

  const createOwner = (actor: Actor, body: object) =>
    http().post('/api/owners').set(bearer(actor.token)).send(body);

  const assign = (
    actor: Actor,
    ownerIds: string[],
    assigneeId: string | null,
  ) =>
    http()
      .post('/api/owners/assign')
      .set(bearer(actor.token))
      .send({ ownerIds, assigneeId });

  const callingList = async (actor: Actor): Promise<string[]> => {
    const res = await http()
      .get('/api/owners/calling-list')
      .set(bearer(actor.token))
      .expect(200);
    return (res.body.data as { id: string }[]).map((o) => o.id);
  };

  beforeAll(async () => {
    db = createTestDb();
    const { adminRoleId, memberRoleId } = await ensureBuiltInRoles(db);
    const role = async (label: string, permissions: string[]) => {
      const r = await db.role.create({
        data: { name: `${run} ${label}`, permissions },
      });
      extraRoles.push(r.id);
      return r.id;
    };
    admin = await createUserWithToken(db, 't6-admin', adminRoleId, []);
    memberA = await createUserWithToken(db, 't6-a', memberRoleId, []);
    memberB = await createUserWithToken(db, 't6-b', memberRoleId, []);
    importer = await createUserWithToken(
      db,
      't6-importer',
      await role('importer', ['owners.import']),
      ['owners.import'],
    );
    assigner = await createUserWithToken(
      db,
      't6-assigner',
      await role('assigner', ['owners.assign']),
      ['owners.assign'],
    );
    restorer = await createUserWithToken(
      db,
      't6-viewer',
      await role('viewer', ['owners.import', 'owners.viewAll']),
      ['owners.import', 'owners.viewAll'],
    );
    inactive = await createUserWithToken(db, 't6-off', memberRoleId, []);
    await db.user.update({
      where: { id: inactive.id },
      data: { active: false },
    });
    users.push(
      ...[admin, memberA, memberB, importer, assigner, restorer, inactive].map(
        (u) => u.id,
      ),
    );

    const outcome = await db.callOutcome.findFirst({
      where: { setsStatus: 'CONTACTED' },
    });
    outcomeId =
      outcome?.id ??
      (
        await db.callOutcome.create({
          data: {
            labelEn: 'No answer',
            labelAr: 'لا يرد',
            setsStatus: 'CONTACTED',
          },
        })
      ).id;

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
      await db.listing.deleteMany({ where: { createdById: where } });
      await db.owner.deleteMany({ where: { createdById: where } });
      await db.importJob.deleteMany({ where: { createdById: where } });
      await db.user.deleteMany({ where: { id: where } });
      await db.role.deleteMany({ where: { id: { in: extraRoles } } });
      await db.$disconnect();
    }
    await app?.close();
  });

  // ================================================================ access

  describe('access', () => {
    it("Member lists owners → only own; never unassigned, never another member's (invariant)", async () => {
      const own = await seedOwner({ assignedToId: memberA.id });
      const other = await seedOwner({ assignedToId: memberB.id });
      const unassigned = await seedOwner();

      const res = await http()
        .get('/api/owners')
        .query({ q: run, limit: 20 })
        .set(bearer(memberA.token))
        .expect(200);
      const rows = res.body.data as {
        id: string;
        assignedTo: { id: string };
      }[];
      const ids = rows.map((r) => r.id);
      expect(ids).toContain(own.id);
      expect(ids).not.toContain(other.id);
      expect(ids).not.toContain(unassigned.id);
      expect(rows.every((r) => r.assignedTo.id === memberA.id)).toBe(true);
      expect(res.body.meta.total).toBe(rows.length);
    });

    it("Member GET/PATCH/notes/timeline on another member's owner → 404 (invariant + contract)", async () => {
      const { id } = await seedOwner({ assignedToId: memberB.id });
      const as = bearer(memberA.token);
      for (const req of [
        () => http().get(`/api/owners/${id}`).set(as),
        () => http().patch(`/api/owners/${id}`).set(as).send({ name: 'x' }),
        () =>
          http().patch(`/api/owners/${id}`).set(as).send({ doNotCall: false }),
        () => http().get(`/api/owners/${id}/notes`).set(as),
        () =>
          http().post(`/api/owners/${id}/notes`).set(as).send({ body: 'hi' }),
        () => http().get(`/api/owners/${id}/timeline`).set(as),
      ]) {
        const res = await req().expect(404);
        expect(res.body).toMatchObject({ success: false, error: 'NOT_FOUND' });
      }
      // ...and the owner's own member gets through.
      await http()
        .get(`/api/owners/${id}`)
        .set(bearer(memberB.token))
        .expect(200);
    });

    it('Member GET on an unassigned owner → 404 (invariant: unassigned visible to admin only)', async () => {
      const { id } = await seedOwner();
      await http()
        .get(`/api/owners/${id}`)
        .set(bearer(memberA.token))
        .expect(404);
      await http()
        .get(`/api/owners/${id}`)
        .set(bearer(admin.token))
        .expect(200);
    });

    it("Phone search by a member can't reveal owners not theirs (invariant: no phone leak)", async () => {
      const { id, phones } = await seedOwner({ assignedToId: memberB.id });
      for (const q of [phones[0], e164(phones[0]), phones[0].slice(3)]) {
        const asA = await http()
          .get('/api/owners')
          .query({ q })
          .set(bearer(memberA.token))
          .expect(200);
        expect(asA.body.data).toEqual([]);
        const asB = await http()
          .get('/api/owners')
          .query({ q })
          .set(bearer(memberB.token))
          .expect(200);
        expect(asB.body.data.map((o: { id: string }) => o.id)).toEqual([id]);
      }
    });

    it('Member passes `assignedTo=unassigned`, `assignedTo=<other>`, `importId` → still only own owners (invariant)', async () => {
      const job = await db.importJob.create({
        data: {
          kind: 'OWNERS',
          fileName: 'owners.xlsx',
          createdById: admin.id,
        },
      });
      const own = await seedOwner({
        assignedToId: memberA.id,
        sourceImportId: job.id,
      });
      const other = await seedOwner({
        assignedToId: memberB.id,
        sourceImportId: job.id,
      });
      const unassigned = await seedOwner({ sourceImportId: job.id });

      for (const query of [
        { assignedTo: 'unassigned' },
        { assignedTo: memberB.id },
        { importId: job.id },
      ]) {
        const res = await http()
          .get('/api/owners')
          .query({ ...query, q: run })
          .set(bearer(memberA.token))
          .expect(200);
        const rows = res.body.data as {
          id: string;
          assignedTo: { id: string } | null;
        }[];
        expect(rows.every((r) => r.assignedTo?.id === memberA.id)).toBe(true);
        const ids = rows.map((r) => r.id);
        expect(ids).not.toContain(other.id);
        expect(ids).not.toContain(unassigned.id);
      }
      // The admin's importId filter sees all three.
      const res = await http()
        .get('/api/owners')
        .query({ importId: job.id })
        .set(bearer(admin.token))
        .expect(200);
      expect(res.body.data.map((o: { id: string }) => o.id).sort()).toEqual(
        [own.id, other.id, unassigned.id].sort(),
      );
    });

    it('Member calls `/owners/assign` or `/owners/ids` → 403 (role)', async () => {
      const { id } = await seedOwner({ assignedToId: memberA.id });
      await assign(memberA, [id], memberA.id).expect(403);
      await http()
        .get('/api/owners/ids')
        .set(bearer(memberA.token))
        .expect(403);
      await http()
        .get('/api/owners/ids')
        .set(bearer(assigner.token))
        .expect(200);
    });

    it('Member without `owners.import` deletes an owner → 403 (role)', async () => {
      const { id } = await seedOwner({ assignedToId: memberA.id });
      await http()
        .delete(`/api/owners/${id}`)
        .set(bearer(memberA.token))
        .expect(403);
      await http()
        .post('/api/owners')
        .set(bearer(memberA.token))
        .send({ name: 'x', phones: [randomLocalMobile()] })
        .expect(403);
      expect(
        (await db.owner.findUnique({ where: { id } }))?.deletedAt,
      ).toBeNull();
    });
  });

  // ================================================================ calling list

  describe('calling list', () => {
    /** 12:00 Cairo on 22 Oct 2026 (UTC+3 until the end of October). */
    const NOON_CAIRO = new Date('2026-10-22T09:00:00.000Z');

    it('Calling list excludes LISTED and DO_NOT_CALL owners (invariant)', async () => {
      const m = await newMember('t6-cl1');
      const listed = await seedOwner({ assignedToId: m.id, status: 'LISTED' });
      const dnc = await seedOwner({
        assignedToId: m.id,
        status: 'DO_NOT_CALL',
      });
      const fresh = await seedOwner({ assignedToId: m.id, status: 'NEW' });
      const ids = await callingList(m);
      expect(ids).toEqual([fresh.id]);
      expect(ids).not.toContain(listed.id);
      expect(ids).not.toContain(dnc.id);
    });

    it('LISTED or DO_NOT_CALL owner with an overdue reminder is still not in the calling list (invariant)', async () => {
      const m = await newMember('t6-cl2');
      const listed = await seedOwner({ assignedToId: m.id, status: 'LISTED' });
      const dnc = await seedOwner({
        assignedToId: m.id,
        status: 'DO_NOT_CALL',
      });
      const past = new Date(Date.now() - DAY);
      await seedReminder({ ownerId: listed.id, memberId: m.id, dueAt: past });
      await seedReminder({ ownerId: dnc.id, memberId: m.id, dueAt: past });
      expect(await callingList(m)).toEqual([]);
    });

    it('Calling list order: overdue reminder → due today → NEW → CALL_BACK → CONTACTED → INTERESTED → NOT_INTERESTED, oldest last call first (business: calling-list order)', async () => {
      frozen = NOON_CAIRO;
      const m = await newMember('t6-cl3');
      const owner = (status: LeadStatus, lastCallAt: Date | null = null) =>
        seedOwner({ assignedToId: m.id, status, lastCallAt });
      const ago = (days: number) => new Date(NOON_CAIRO.getTime() - days * DAY);

      const overdue = await owner('NOT_INTERESTED', ago(1));
      await seedReminder({
        ownerId: overdue.id,
        memberId: m.id,
        dueAt: new Date(NOON_CAIRO.getTime() - HOUR),
      });
      const dueToday = await owner('INTERESTED', ago(1));
      await seedReminder({
        ownerId: dueToday.id,
        memberId: m.id,
        dueAt: new Date(NOON_CAIRO.getTime() + 6 * HOUR),
      });
      const isNew = await owner('NEW');
      const callBack = await owner('CALL_BACK', ago(2));
      const contactedRecent = await owner('CONTACTED', ago(1));
      const contactedOld = await owner('CONTACTED', ago(5));
      const interested = await owner('INTERESTED', ago(3));
      const notInterested = await owner('NOT_INTERESTED', ago(3));
      // A done reminder doesn't lift an owner into the reminder buckets.
      await seedReminder({
        ownerId: notInterested.id,
        memberId: m.id,
        dueAt: ago(1),
        doneAt: ago(1),
      });

      expect(await callingList(m)).toEqual([
        overdue.id,
        dueToday.id,
        isNew.id,
        callBack.id,
        contactedOld.id,
        contactedRecent.id,
        interested.id,
        notInterested.id,
      ]);
    });

    it('"Today" boundaries in Africa/Cairo: a reminder at 23:30 Cairo is "today", not tomorrow (contract: Cairo dates)', async () => {
      frozen = NOON_CAIRO;
      const m = await newMember('t6-cl4');
      const late = await seedOwner({
        assignedToId: m.id,
        status: 'NOT_INTERESTED',
      });
      // 23:30 Cairo on the 22nd = 20:30 UTC.
      await seedReminder({
        ownerId: late.id,
        memberId: m.id,
        dueAt: new Date('2026-10-22T20:30:00.000Z'),
      });
      // 00:30 Cairo on the 23rd = 21:30 UTC on the 22nd: tomorrow, though UTC says today.
      const tomorrow = await seedOwner({
        assignedToId: m.id,
        status: 'NOT_INTERESTED',
      });
      await seedReminder({
        ownerId: tomorrow.id,
        memberId: m.id,
        dueAt: new Date('2026-10-22T21:30:00.000Z'),
      });
      const fresh = await seedOwner({ assignedToId: m.id, status: 'NEW' });

      expect(await callingList(m)).toEqual([late.id, fresh.id, tomorrow.id]);
    });

    it('Never-called owners sort before called ones within a status; ties broken by created date (business: calling-list order)', async () => {
      const m = await newMember('t6-cl5');
      const t0 = Date.now() - 10 * DAY;
      const called = await seedOwner({
        assignedToId: m.id,
        lastCallAt: new Date(t0),
        createdAt: new Date(t0 - DAY),
      });
      const second = await seedOwner({
        assignedToId: m.id,
        createdAt: new Date(t0 + HOUR),
      });
      const first = await seedOwner({
        assignedToId: m.id,
        createdAt: new Date(t0),
      });
      expect(await callingList(m)).toEqual([first.id, second.id, called.id]);
    });

    it('is paginated and only ever holds own owners', async () => {
      const m = await newMember('t6-cl6');
      for (let i = 0; i < 3; i++) await seedOwner({ assignedToId: m.id });
      await seedOwner({ assignedToId: memberB.id });
      const res = await http()
        .get('/api/owners/calling-list')
        .query({ limit: 2, page: 2 })
        .set(bearer(m.token))
        .expect(200);
      expect(res.body.data).toHaveLength(1);
      expect(res.body.meta).toMatchObject({
        total: 3,
        page: 2,
        limit: 2,
        hasNextPage: false,
        hasPreviousPage: true,
      });
    });
  });

  // ================================================================ create

  describe('create', () => {
    it('Create owner with a phone already on another owner (any slot) → 409 PHONE_EXISTS with ownerId (invariant)', async () => {
      const existing = await seedOwner({
        phones: [randomLocalMobile(), randomLocalMobile(), randomLocalMobile()],
      });
      for (const phone of existing.phones) {
        const res = await createOwner(admin, {
          name: 'Dup',
          phones: [randomLocalMobile(), phone],
        }).expect(409);
        expect(res.body).toMatchObject({
          error: 'PHONE_EXISTS',
          data: { ownerId: existing.id, phone: e164(phone) },
        });
      }
    });

    it("Create owner with a phone that is a listing's owner phone → 409 PHONE_EXISTS with listingId (flow: import duplicates rule)", async () => {
      const phone = randomLocalMobile();
      const listingId = await seedListing({ ownerPhone: e164(phone) });
      const res = await createOwner(admin, {
        name: 'Listing owner',
        phones: [phone],
      }).expect(409);
      expect(res.body).toMatchObject({
        error: 'PHONE_EXISTS',
        data: { listingId },
      });
    });

    it('Same phone typed two ways (`01001234567`, `+20 100 123 4567`) → treated as one (decision: normalisation)', async () => {
      const phone = randomLocalMobile();
      const created = await createOwner(admin, {
        name: 'Two ways',
        phones: [phone],
      }).expect(201);
      expect(created.body.data.phones).toEqual([e164(phone)]);

      const res = await createOwner(admin, {
        name: 'Two ways again',
        phones: [spaced(phone)],
      }).expect(409);
      expect(res.body.data.ownerId).toBe(created.body.data.id);

      // Searching either way finds it.
      for (const q of [phone, spaced(phone)]) {
        const found = await http()
          .get('/api/owners')
          .query({ q })
          .set(bearer(admin.token))
          .expect(200);
        expect(found.body.data.map((o: { id: string }) => o.id)).toEqual([
          created.body.data.id,
        ]);
      }
    });

    it('4 phones, 0 phones, an invalid phone → 400 (contract: 1–3 phones)', async () => {
      const four = Array.from({ length: 4 }, () => randomLocalMobile());
      for (const phones of [four, [], ['12345'], ['not a phone'], [42]]) {
        const res = await createOwner(admin, { name: 'Bad', phones }).expect(
          400,
        );
        expect(res.body.error).toBe('VALIDATION_FAILED');
      }
      await createOwner(admin, { name: 'No phones' }).expect(400);
    });

    it("Same phone twice in one owner's phones → 400 (checklist: duplicates)", async () => {
      const phone = randomLocalMobile();
      await createOwner(admin, {
        name: 'Twice',
        phones: [phone, phone],
      }).expect(400);
      await createOwner(admin, {
        name: 'Twice',
        phones: [phone, spaced(phone)],
      }).expect(400);
      const { id } = await seedOwner();
      await http()
        .patch(`/api/owners/${id}`)
        .set(bearer(admin.token))
        .send({ phones: [phone, `0020${phone.slice(1)}`] })
        .expect(400);
    });

    it('`POST /owners` with `assignedTo` by a user without `owners.assign` → 403; `assignedTo` inactive → 400 INVALID_ASSIGNEE (role: only assigners assign)', async () => {
      const phone = randomLocalMobile();
      await createOwner(importer, {
        name: 'Assigned',
        phones: [phone],
        assignedTo: memberA.id,
      }).expect(403);
      const res = await createOwner(admin, {
        name: 'Assigned',
        phones: [phone],
        assignedTo: inactive.id,
      }).expect(400);
      expect(res.body.error).toBe('INVALID_ASSIGNEE');
      await createOwner(admin, {
        name: 'Assigned',
        phones: [phone],
        assignedTo: randomUUID(),
      }).expect(400);
      // Nothing was saved by the refused attempts.
      expect(await db.ownerPhone.count({ where: { phone: e164(phone) } })).toBe(
        0,
      );

      // The importer may add an unassigned owner; the admin an assigned one.
      await createOwner(importer, {
        name: 'Unassigned',
        phones: [phone],
      }).expect(201);
      const assigned = await createOwner(admin, {
        name: 'Assigned',
        phones: [randomLocalMobile()],
        assignedTo: memberA.id,
        area: '  Sheikh Zayed ',
        note: '  Wants to sell in spring ',
      }).expect(201);
      expect(assigned.body.data).toMatchObject({
        status: 'NEW',
        area: 'Sheikh Zayed',
        assignedTo: { id: memberA.id },
        notes: [{ body: 'Wants to sell in spring' }],
        listingId: null,
        source: null,
        lastCall: null,
        nextReminderAt: null,
      });
      await http()
        .get(`/api/owners/${assigned.body.data.id}`)
        .set(bearer(memberA.token))
        .expect(200);
    });

    it('Create owner with a phone that belongs to a trashed owner → 409 PHONE_IN_TRASH (admin) (decision: trashed owners keep their phone)', async () => {
      const trashed = await seedOwner({
        deletedAt: new Date(),
        deletedById: admin.id,
      });
      const asAdmin = await createOwner(admin, {
        name: 'Reuse',
        phones: [trashed.phones[0]],
      }).expect(409);
      expect(asAdmin.body).toMatchObject({
        error: 'PHONE_IN_TRASH',
        data: { ownerId: trashed.id },
      });
      // Without trash.restore: the plain PHONE_EXISTS, and no id of a record they can't open.
      for (const actor of [importer, restorer]) {
        const res = await createOwner(actor, {
          name: 'Reuse',
          phones: [trashed.phones[0]],
        }).expect(409);
        expect(res.body.error).toBe('PHONE_EXISTS');
        expect(res.body.data).toBeUndefined();
      }
    });
  });

  // ================================================================ update

  describe('update', () => {
    it("Member PATCHes own owner's phone to another owner's phone → 409 PHONE_EXISTS with no ids (invariant: no data about owners not theirs)", async () => {
      const own = await seedOwner({ assignedToId: memberA.id });
      const other = await seedOwner({ assignedToId: memberB.id });
      const res = await http()
        .patch(`/api/owners/${own.id}`)
        .set(bearer(memberA.token))
        .send({ phones: [own.phones[0], other.phones[0]] })
        .expect(409);
      expect(res.body.error).toBe('PHONE_EXISTS');
      expect(res.body.data).toBeUndefined();
      expect(JSON.stringify(res.body)).not.toContain(other.id);

      // A phone held by a listing: same answer.
      const listingPhone = randomLocalMobile();
      await seedListing({ ownerPhone: e164(listingPhone) });
      const viaListing = await http()
        .patch(`/api/owners/${own.id}`)
        .set(bearer(memberA.token))
        .send({ phones: [listingPhone] })
        .expect(409);
      expect(viaListing.body.data).toBeUndefined();
      // Unchanged.
      const after = await db.ownerPhone.findMany({
        where: { ownerId: own.id },
      });
      expect(after.map((p) => p.phone)).toEqual([e164(own.phones[0])]);
    });

    it('a member edits own owner: name, area, phones (reordered, re-typed)', async () => {
      const p1 = randomLocalMobile();
      const p2 = randomLocalMobile();
      const own = await seedOwner({ assignedToId: memberA.id, phones: [p1] });
      const listingId = await seedListing({
        ownerId: own.id,
        ownerPhone: e164(p1),
        assignedToId: memberA.id,
      });
      const res = await http()
        .patch(`/api/owners/${own.id}`)
        .set(bearer(memberA.token))
        .send({
          name: '  سارة أحمد 🏠 ',
          area: 'Maadi',
          phones: [p2, spaced(p1)],
        })
        .expect(200);
      expect(res.body.data).toMatchObject({
        name: 'سارة أحمد 🏠',
        area: 'Maadi',
        phones: [e164(p2), e164(p1)],
        listingId,
      });
      const cleared = await http()
        .patch(`/api/owners/${own.id}`)
        .set(bearer(memberA.token))
        .send({ area: null })
        .expect(200);
      expect(cleared.body.data.area).toBeNull();
    });

    it('`doNotCall: true` sets status DO_NOT_CALL; member can set it on own owner (business: Do not call flag)', async () => {
      const own = await seedOwner({
        assignedToId: memberA.id,
        status: 'CALL_BACK',
      });
      const res = await http()
        .patch(`/api/owners/${own.id}`)
        .set(bearer(memberA.token))
        .send({ doNotCall: true })
        .expect(200);
      expect(res.body.data.status).toBe('DO_NOT_CALL');
      expect(await callingList(memberA)).not.toContain(own.id);
    });

    it('Member sets Do not call on own owner; member clearing Do not call → 403, admin can clear it to Contacted (business: Do not call flag)', async () => {
      const own = await seedOwner({ assignedToId: memberA.id, status: 'NEW' });
      await http()
        .patch(`/api/owners/${own.id}`)
        .set(bearer(memberA.token))
        .send({ doNotCall: true })
        .expect(200);
      const refused = await http()
        .patch(`/api/owners/${own.id}`)
        .set(bearer(memberA.token))
        .send({ doNotCall: false })
        .expect(403);
      expect(refused.body.error).toBe('FORBIDDEN');
      expect(
        (await db.owner.findUnique({ where: { id: own.id } }))?.status,
      ).toBe('DO_NOT_CALL');
      const cleared = await http()
        .patch(`/api/owners/${own.id}`)
        .set(bearer(admin.token))
        .send({ doNotCall: false })
        .expect(200);
      expect(cleared.body.data.status).toBe('CONTACTED');
      expect(await callingList(memberA)).toContain(own.id);
    });

    it('Do not call on a Listed owner → 409 OWNER_LISTED (it leaves the list through its listing)', async () => {
      const own = await seedOwner({
        assignedToId: memberA.id,
        status: 'LISTED',
      });
      const res = await http()
        .patch(`/api/owners/${own.id}`)
        .set(bearer(memberA.token))
        .send({ doNotCall: true })
        .expect(409);
      expect(res.body.error).toBe('OWNER_LISTED');
    });
  });

  // ================================================================ delete

  describe('delete', () => {
    it('Delete an owner with a listing → 409 OWNER_LISTED (business)', async () => {
      const owner = await seedOwner({ status: 'LISTED' });
      await seedListing({ ownerId: owner.id });
      const res = await http()
        .delete(`/api/owners/${owner.id}`)
        .set(bearer(admin.token))
        .expect(409);
      expect(res.body.error).toBe('OWNER_LISTED');
      expect(
        (await db.owner.findUnique({ where: { id: owner.id } }))?.deletedAt,
      ).toBeNull();
    });

    it('Delete owner writes an activity entry; its open reminders close; its calls stay (business: activity log; calls never deleted)', async () => {
      const owner = await seedOwner({ assignedToId: memberA.id });
      const open = await seedReminder({
        ownerId: owner.id,
        memberId: memberA.id,
      });
      const done = await seedReminder({
        ownerId: owner.id,
        memberId: memberA.id,
        doneAt: new Date(Date.now() - DAY),
      });
      const call = await seedCall(owner.id, memberA.id, new Date());

      await http()
        .delete(`/api/owners/${owner.id}`)
        .set(bearer(importer.token))
        .expect(200);

      const entry = await db.activityEntry.findFirst({
        where: { type: 'DELETE', targetKind: 'OWNER', targetId: owner.id },
      });
      expect(entry?.actorId).toBe(importer.id);
      const reminders = await db.reminder.findMany({
        where: { id: { in: [open, done] } },
      });
      expect(reminders.every((r) => r.doneAt !== null)).toBe(true);
      expect(
        reminders.find((r) => r.id === done)?.doneAt?.getTime(),
      ).toBeLessThan(Date.now() - HOUR);
      expect(await db.call.findUnique({ where: { id: call } })).toMatchObject({
        ownerId: owner.id,
      });
      // Gone from every owner endpoint.
      await http()
        .get(`/api/owners/${owner.id}`)
        .set(bearer(admin.token))
        .expect(404);
      await http()
        .delete(`/api/owners/${owner.id}`)
        .set(bearer(admin.token))
        .expect(404);
    });
  });

  // ================================================================ assign

  describe('assign', () => {
    it('Assign to an inactive member → 400 INVALID_ASSIGNEE (flow: assign to an active member)', async () => {
      const { id } = await seedOwner();
      const res = await assign(admin, [id], inactive.id).expect(400);
      expect(res.body.error).toBe('INVALID_ASSIGNEE');
      await assign(admin, [id], randomUUID()).expect(400);
      expect(
        (await db.owner.findUnique({ where: { id } }))?.assignedToId,
      ).toBeNull();
    });

    it("Reassign moves open reminders and the owner's listing to the new member; done reminders and calls keep their member (flow: reassign)", async () => {
      const owner = await seedOwner({
        assignedToId: memberA.id,
        status: 'LISTED',
      });
      const listingId = await seedListing({
        ownerId: owner.id,
        assignedToId: memberA.id,
      });
      const open = await seedReminder({
        ownerId: owner.id,
        memberId: memberA.id,
      });
      const onListing = await seedReminder({
        listingId,
        memberId: memberA.id,
        kind: 'AD_CHECK_IN',
      });
      const done = await seedReminder({
        ownerId: owner.id,
        memberId: memberA.id,
        doneAt: new Date(),
      });
      const call = await seedCall(owner.id, memberA.id, new Date());

      const res = await assign(admin, [owner.id], memberB.id).expect(200);
      expect(res.body.data).toEqual({ moved: 1 });

      expect(
        (await db.owner.findUnique({ where: { id: owner.id } }))?.assignedToId,
      ).toBe(memberB.id);
      expect(
        (await db.listing.findUnique({ where: { id: listingId } }))
          ?.assignedToId,
      ).toBe(memberB.id);
      const member = async (id: string) =>
        (await db.reminder.findUnique({ where: { id } }))?.memberId;
      expect(await member(open)).toBe(memberB.id);
      expect(await member(onListing)).toBe(memberB.id);
      expect(await member(done)).toBe(memberA.id);
      expect(
        (await db.call.findUnique({ where: { id: call } }))?.memberId,
      ).toBe(memberA.id);
      // One timeline row: from A to B, by the admin.
      expect(
        await db.ownerAssignment.findMany({
          where: { ownerId: owner.id },
          select: { fromMemberId: true, toMemberId: true, byId: true },
        }),
      ).toEqual([
        { fromMemberId: memberA.id, toMemberId: memberB.id, byId: admin.id },
      ]);
      await http()
        .get(`/api/owners/${owner.id}`)
        .set(bearer(memberA.token))
        .expect(404);
    });

    it('Assign 5001 ids → 400; assign with ids that include a deleted owner → those skipped, `moved` counts the rest (contract)', async () => {
      const ids = Array.from({ length: 5001 }, () => randomUUID());
      await assign(admin, ids, memberA.id).expect(400);
      await assign(admin, [], memberA.id).expect(400);

      const live1 = await seedOwner();
      const live2 = await seedOwner();
      const deleted = await seedOwner({
        deletedAt: new Date(),
        deletedById: admin.id,
      });
      const res = await assign(
        admin,
        [live1.id, live2.id, deleted.id, randomUUID(), live1.id],
        memberA.id,
      ).expect(200);
      expect(res.body.data).toEqual({ moved: 2 });
      expect(
        (await db.owner.findUnique({ where: { id: deleted.id } }))
          ?.assignedToId,
      ).toBeNull();
    });

    it('Assign to `null` → unassigned; member loses access immediately (flow)', async () => {
      const { id } = await seedOwner({ assignedToId: memberA.id });
      await http()
        .get(`/api/owners/${id}`)
        .set(bearer(memberA.token))
        .expect(200);
      const res = await assign(admin, [id], null).expect(200);
      expect(res.body.data).toEqual({ moved: 1 });
      await http()
        .get(`/api/owners/${id}`)
        .set(bearer(memberA.token))
        .expect(404);
      const asAdmin = await http()
        .get(`/api/owners/${id}`)
        .set(bearer(admin.token))
        .expect(200);
      expect(asAdmin.body.data.assignedTo).toBeNull();
    });

    it('Every assignment writes one activity entry per batch with the count (business: activity log)', async () => {
      const owners = await Promise.all([seedOwner(), seedOwner(), seedOwner()]);
      const before = await db.activityEntry.count({
        where: { actorId: assigner.id, type: 'ASSIGN' },
      });
      await assign(
        assigner,
        owners.map((o) => o.id),
        memberA.id,
      ).expect(200);
      await assign(assigner, [owners[0].id], null).expect(200);
      const entries = await db.activityEntry.findMany({
        where: { actorId: assigner.id, type: 'ASSIGN' },
        orderBy: { createdAt: 'asc' },
      });
      expect(entries).toHaveLength(before + 2);
      expect(entries[before].details).toMatchObject({
        count: 3,
        assigneeId: memberA.id,
      });
      expect(entries[before + 1].details).toMatchObject({
        count: 1,
        assigneeId: null,
      });
    });

    it("Assign with `assigneeId: null` → owner's open reminders become unassigned; next assignment moves them to the new member (business: reminders follow)", async () => {
      const owner = await seedOwner({ assignedToId: memberA.id });
      const reminder = await seedReminder({
        ownerId: owner.id,
        memberId: memberA.id,
      });
      await assign(admin, [owner.id], null).expect(200);
      expect(
        (await db.reminder.findUnique({ where: { id: reminder } }))?.memberId,
      ).toBeNull();
      await assign(admin, [owner.id], memberB.id).expect(200);
      expect(
        (await db.reminder.findUnique({ where: { id: reminder } }))?.memberId,
      ).toBe(memberB.id);
    });

    it('Reassigning an owner moves its listing; reassigning a listing moves its owner (business: owner and listing stay together)', async () => {
      const owner = await seedOwner({
        assignedToId: memberA.id,
        status: 'LISTED',
      });
      const listingId = await seedListing({
        ownerId: owner.id,
        assignedToId: memberA.id,
      });
      await assign(admin, [owner.id], memberB.id).expect(200);
      expect(
        (await db.listing.findUnique({ where: { id: listingId } }))
          ?.assignedToId,
      ).toBe(memberB.id);

      // The listings task's /listings/assign goes through the same helper.
      const reminder = await seedReminder({
        ownerId: owner.id,
        memberId: memberB.id,
      });
      const assignment = app.get(AssignmentService);
      const result = await app
        .get(DatabaseService)
        .transaction((tx) =>
          assignment.reassignOwnerAndListing(
            tx,
            { listingIds: [listingId] },
            memberA.id,
            admin.id,
          ),
        );
      expect(result).toMatchObject({
        ownerIds: [owner.id],
        listingIds: [listingId],
      });
      expect(
        (await db.owner.findUnique({ where: { id: owner.id } }))?.assignedToId,
      ).toBe(memberA.id);
      expect(
        (await db.reminder.findUnique({ where: { id: reminder } }))?.memberId,
      ).toBe(memberA.id);
      expect(
        await db.ownerAssignment.count({ where: { ownerId: owner.id } }),
      ).toBe(2);
    });

    it('Admin lists unassigned open reminders (`GET /reminders?unassigned=true`) (business: visible to the admin)', async () => {
      const owner = await seedOwner({ name: `${run} unassigned reminder` });
      const open = await seedReminder({ ownerId: owner.id, memberId: null });
      const done = await seedReminder({
        ownerId: owner.id,
        memberId: null,
        doneAt: new Date(),
      });
      const listingId = await seedListing();
      const onListing = await seedReminder({
        listingId,
        memberId: null,
        kind: 'AD_CHECK_IN',
      });
      const deletedOwner = await seedOwner({
        deletedAt: new Date(),
        deletedById: admin.id,
      });
      const onDeleted = await seedReminder({
        ownerId: deletedOwner.id,
        memberId: null,
      });

      const all: {
        id: string;
        member: unknown;
        owner: unknown;
        listing: unknown;
      }[] = [];
      for (let page = 1; ; page++) {
        const res = await http()
          .get('/api/reminders')
          .query({ unassigned: true, page })
          .set(bearer(admin.token))
          .expect(200);
        all.push(...res.body.data);
        if (!res.body.meta.hasNextPage) break;
      }
      const ids = all.map((r) => r.id);
      expect(ids).toEqual(expect.arrayContaining([open, onListing]));
      expect(ids).not.toContain(done);
      expect(ids).not.toContain(onDeleted);
      expect(all.every((r) => r.member === null)).toBe(true);
      expect(all.find((r) => r.id === open)).toMatchObject({
        owner: { id: owner.id, name: `${run} unassigned reminder` },
        listing: null,
      });
      expect(all.find((r) => r.id === onListing)).toMatchObject({
        owner: null,
        listing: { id: listingId, title: 'Apartment · New Cairo' },
      });

      await http()
        .get('/api/reminders')
        .query({ unassigned: true })
        .set(bearer(assigner.token))
        .expect(200);
      await http()
        .get('/api/reminders')
        .query({ unassigned: true })
        .set(bearer(memberA.token))
        .expect(403);
    });
  });

  // ================================================================ notes, timeline

  describe('notes and timeline', () => {
    it('Note body empty or > 2000 → 400 (contract)', async () => {
      const { id } = await seedOwner({ assignedToId: memberA.id });
      const post = (body: object) =>
        http()
          .post(`/api/owners/${id}/notes`)
          .set(bearer(memberA.token))
          .send(body);
      for (const body of [
        {},
        { body: '' },
        { body: '   ' },
        { body: 'x'.repeat(2001) },
        { body: 5 },
        { body: 'ok', authorId: memberB.id },
      ]) {
        await post(body).expect(400);
      }
      const ok = await post({ body: ` ${'ن'.repeat(1999)}🙂 ` }).expect(201);
      expect(ok.body.data).toMatchObject({
        body: `${'ن'.repeat(1999)}🙂`,
        author: { id: memberA.id, name: memberA.name },
      });
    });

    it('`PATCH`/`DELETE` on a note → 404/405, no edit path exists (business: notes are added, not edited)', async () => {
      const { id } = await seedOwner({ assignedToId: memberA.id });
      const note = await http()
        .post(`/api/owners/${id}/notes`)
        .set(bearer(memberA.token))
        .send({ body: 'first' })
        .expect(201);
      const noteId = note.body.data.id as string;
      for (const path of [
        `/api/owners/${id}/notes/${noteId}`,
        `/api/notes/${noteId}`,
      ]) {
        await http()
          .patch(path)
          .set(bearer(admin.token))
          .send({ body: 'edited' })
          .expect(404);
        await http().delete(path).set(bearer(admin.token)).expect(404);
      }
      expect((await db.note.findUnique({ where: { id: noteId } }))?.body).toBe(
        'first',
      );
    });

    it('notes list newest first; the owner carries the latest 3', async () => {
      const { id } = await seedOwner({ assignedToId: memberA.id });
      for (const body of ['one', 'two', 'three', 'four']) {
        await db.note.create({
          data: { ownerId: id, authorId: memberA.id, body },
        });
        await new Promise((r) => setTimeout(r, 5));
      }
      const list = await http()
        .get(`/api/owners/${id}/notes`)
        .query({ limit: 3 })
        .set(bearer(memberA.token))
        .expect(200);
      expect(list.body.data.map((n: { body: string }) => n.body)).toEqual([
        'four',
        'three',
        'two',
      ]);
      expect(list.body.meta).toMatchObject({ total: 4, hasNextPage: true });
      const owner = await http()
        .get(`/api/owners/${id}`)
        .set(bearer(memberA.token))
        .expect(200);
      expect(
        owner.body.data.notes.map((n: { body: string }) => n.body),
      ).toEqual(['four', 'three', 'two']);
    });

    it('timeline: calls, notes, reminders and assignments, newest first', async () => {
      const owner = await seedOwner({ assignedToId: memberA.id });
      const t = Date.now();
      const call = await seedCall(owner.id, memberA.id, new Date(t - 4 * HOUR));
      await db.note.create({
        data: {
          ownerId: owner.id,
          authorId: memberA.id,
          body: 'note',
          createdAt: new Date(t - 3 * HOUR),
        },
      });
      await seedReminder({
        ownerId: owner.id,
        memberId: memberA.id,
        createdAt: new Date(t - 2 * HOUR),
      });
      await assign(admin, [owner.id], memberB.id).expect(200);

      const res = await http()
        .get(`/api/owners/${owner.id}/timeline`)
        .set(bearer(memberB.token))
        .expect(200);
      const items = res.body.data as { kind: string }[];
      expect(items.map((i) => i.kind)).toEqual([
        'ASSIGN',
        'REMINDER',
        'NOTE',
        'CALL',
      ]);
      expect(items[0]).toMatchObject({
        from: { id: memberA.id },
        to: { id: memberB.id },
        by: { id: admin.id },
      });
      expect(items[1]).toMatchObject({
        reminder: { owner: { id: owner.id }, member: { id: memberB.id } },
      });
      expect(items[3]).toMatchObject({
        call: {
          id: call,
          owner: { id: owner.id },
          member: { id: memberA.id },
          outcome: { id: outcomeId, setsStatus: 'CONTACTED' },
        },
      });
      expect(res.body.meta.total).toBe(4);

      const page2 = await http()
        .get(`/api/owners/${owner.id}/timeline`)
        .query({ limit: 3, page: 2 })
        .set(bearer(memberB.token))
        .expect(200);
      expect(page2.body.data.map((i: { kind: string }) => i.kind)).toEqual([
        'CALL',
      ]);
    });
  });

  // ================================================================ rows, ids, lookups, restore

  describe('rows, ids, areas, restore', () => {
    it('OwnerRow carries phones, the last call with an outcome and the next open reminder', async () => {
      const owner = await seedOwner({
        assignedToId: memberA.id,
        phones: [randomLocalMobile(), randomLocalMobile()],
        area: 'Madinaty',
      });
      const callAt = new Date(Date.now() - DAY);
      await seedCall(owner.id, memberA.id, callAt);
      const soon = new Date(Date.now() + HOUR);
      await seedReminder({
        ownerId: owner.id,
        memberId: memberA.id,
        dueAt: soon,
      });
      await seedReminder({
        ownerId: owner.id,
        memberId: memberA.id,
        dueAt: new Date(Date.now() + 5 * DAY),
      });
      const res = await http()
        .get(`/api/owners/${owner.id}`)
        .set(bearer(memberA.token))
        .expect(200);
      expect(res.body.data).toMatchObject({
        phones: owner.phones.map(e164),
        area: 'Madinaty',
        assignedTo: { id: memberA.id, name: memberA.name },
        lastCall: { at: callAt.toISOString(), outcome: { id: outcomeId } },
        nextReminderAt: soon.toISOString(),
      });
      // hasReminder filters on open reminders.
      const withReminder = await http()
        .get('/api/owners')
        .query({ hasReminder: 'true', q: owner.phones[1] })
        .set(bearer(memberA.token))
        .expect(200);
      expect(withReminder.body.data).toHaveLength(1);
      const without = await http()
        .get('/api/owners')
        .query({ hasReminder: 'false', q: owner.phones[1] })
        .set(bearer(memberA.token))
        .expect(200);
      expect(without.body.data).toHaveLength(0);
    });

    it('`/owners/ids` returns "next N unassigned" with the total', async () => {
      const tag = `${run}-ids`;
      for (let i = 0; i < 3; i++) await seedOwner({ name: `${tag} ${i}` });
      await seedOwner({ name: `${tag} taken`, assignedToId: memberA.id });
      const res = await http()
        .get('/api/owners/ids')
        .query({ assignedTo: 'unassigned', q: tag, take: 2 })
        .set(bearer(assigner.token))
        .expect(200);
      expect(res.body.data.ids).toHaveLength(2);
      expect(res.body.data.total).toBe(3);
      // Without owners.viewAll, /ids doesn't search by phone (no phone-to-owner probing).
      const probe = await seedOwner({ name: `${tag} probe` });
      const byPhone = await http()
        .get('/api/owners/ids')
        .query({ q: probe.phones[0] })
        .set(bearer(assigner.token))
        .expect(200);
      expect(byPhone.body.data).toEqual({ ids: [], total: 0 });
      const asAdmin = await http()
        .get('/api/owners/ids')
        .query({ q: probe.phones[0] })
        .set(bearer(admin.token))
        .expect(200);
      expect(asAdmin.body.data).toEqual({ ids: [probe.id], total: 1 });
      for (const take of [0, 5001, 'all']) {
        await http()
          .get('/api/owners/ids')
          .query({ take })
          .set(bearer(assigner.token))
          .expect(400);
      }
    });

    it('`sort` and `status[]` filters', async () => {
      const tag = `${run}-sort`;
      const b = await seedOwner({ name: `${tag} b`, status: 'NEW' });
      const a = await seedOwner({ name: `${tag} a`, status: 'CALL_BACK' });
      await seedOwner({ name: `${tag} c`, status: 'LISTED' });
      const res = await http()
        .get('/api/owners')
        .query({ q: tag, sort: 'name', status: 'NEW,CALL_BACK' })
        .set(bearer(admin.token))
        .expect(200);
      expect(res.body.data.map((o: { id: string }) => o.id)).toEqual([
        a.id,
        b.id,
      ]);
      const repeated = await http()
        .get(
          `/api/owners?q=${encodeURIComponent(tag)}&status=NEW&status=LISTED`,
        )
        .set(bearer(admin.token))
        .expect(200);
      expect(repeated.body.data).toHaveLength(2);
      await http()
        .get('/api/owners')
        .query({ sort: 'phone' })
        .set(bearer(admin.token))
        .expect(400);
    });

    it('`GET /lookups/areas` lists areas with their compounds from live owners and listings', async () => {
      const area = `${run} Area`;
      await seedOwner({ area });
      await seedListing({ area, compound: 'Mivida' });
      await seedListing({ area, compound: 'Eastown' });
      await seedListing({
        area: `${run} Gone`,
        deletedAt: new Date(),
        deletedById: admin.id,
      });
      const res = await http()
        .get('/api/lookups/areas')
        .query({ q: run })
        .set(bearer(memberA.token))
        .expect(200);
      expect(res.body.data).toEqual([
        { area, compounds: ['Eastown', 'Mivida'] },
      ]);
      const byCompound = await http()
        .get('/api/lookups/areas')
        .query({ q: 'mivid' })
        .set(bearer(memberA.token))
        .expect(200);
      expect(byCompound.body.data).toContainEqual({
        area,
        compounds: ['Eastown', 'Mivida'],
      });
      await http()
        .get('/api/lookups/areas')
        .query({ limit: 100 })
        .set(bearer(memberA.token))
        .expect(200);
      await http()
        .get('/api/lookups/areas')
        .query({ limit: 101 })
        .set(bearer(memberA.token))
        .expect(400);
      const pct = await http()
        .get('/api/lookups/areas')
        .query({ q: '%' })
        .set(bearer(memberA.token))
        .expect(200);
      expect(pct.body.data).toEqual([]);
    });

    it('Restore an owner → it returns with its phones and its listing link (OWNER restore handler)', async () => {
      const owner = await seedOwner({
        assignedToId: memberA.id,
        status: 'INTERESTED',
        phones: [randomLocalMobile(), randomLocalMobile()],
      });
      const listingId = await seedListing({
        ownerId: owner.id,
        deletedAt: new Date(),
        deletedById: admin.id,
      });
      await http()
        .delete(`/api/owners/${owner.id}`)
        .set(bearer(admin.token))
        .expect(200);
      await http()
        .post(`/api/trash/owner/${owner.id}/restore`)
        .set(bearer(admin.token))
        .expect(200);
      const res = await http()
        .get(`/api/owners/${owner.id}`)
        .set(bearer(memberA.token))
        .expect(200);
      expect(res.body.data).toMatchObject({
        phones: owner.phones.map(e164),
        status: 'INTERESTED',
        assignedTo: { id: memberA.id },
      });
      expect(
        (await db.listing.findUnique({ where: { id: listingId } }))?.ownerId,
      ).toBe(owner.id);
    });

    it('Restoring an owner whose member was deactivated meanwhile brings it back unassigned', async () => {
      const m = await newMember('t6-gone');
      const owner = await seedOwner({ assignedToId: m.id });
      await http()
        .delete(`/api/owners/${owner.id}`)
        .set(bearer(admin.token))
        .expect(200);
      await db.user.update({ where: { id: m.id }, data: { active: false } });
      await http()
        .post(`/api/trash/owner/${owner.id}/restore`)
        .set(bearer(admin.token))
        .expect(200);
      expect(
        (await db.owner.findUnique({ where: { id: owner.id } }))?.assignedToId,
      ).toBeNull();
    });
  });

  // ================================================================ generic checklist

  describe('generic checklist', () => {
    it('no token, an expired token → 401 on every owner route', async () => {
      const id = randomUUID();
      const routes: [string, string][] = [
        ['get', '/api/owners'],
        ['get', '/api/owners/calling-list'],
        ['get', '/api/owners/ids'],
        ['post', '/api/owners'],
        ['post', '/api/owners/assign'],
        ['get', `/api/owners/${id}`],
        ['patch', `/api/owners/${id}`],
        ['delete', `/api/owners/${id}`],
        ['get', `/api/owners/${id}/timeline`],
        ['get', `/api/owners/${id}/notes`],
        ['post', `/api/owners/${id}/notes`],
        ['get', '/api/lookups/areas'],
        ['get', '/api/reminders'],
      ];
      const expired = signExpiredToken(admin.claims);
      for (const [method, path] of routes) {
        const call = (
          http() as unknown as Record<string, (p: string) => request.Test>
        )[method](path);
        await call.expect(401);
        const again = (
          http() as unknown as Record<string, (p: string) => request.Test>
        )[method](path);
        await again.set(bearer(expired)).expect(401);
      }
    });

    it('validation: missing, extra and wrong-type fields → 400', async () => {
      const phone = randomLocalMobile();
      for (const body of [
        {},
        { phones: [phone] },
        { name: 'x', phones: [phone], status: 'LISTED' },
        { name: 'x', phones: [phone], createdById: admin.id },
        { name: 42, phones: [phone] },
        { name: 'x', phones: phone },
        { name: 'x'.repeat(201), phones: [phone] },
        { name: 'x', phones: [phone], assignedTo: 'sara' },
        { name: 'x', phones: [phone], area: '' },
      ]) {
        const res = await createOwner(admin, body).expect(400);
        expect(res.body.error).toBe('VALIDATION_FAILED');
      }
      const { id } = await seedOwner();
      for (const body of [
        { status: 'NEW' },
        { assignedTo: memberA.id },
        { name: null },
        { phones: null },
        { doNotCall: null },
        { doNotCall: 'true' },
        { phones: [] },
        { name: '' },
      ]) {
        await http()
          .patch(`/api/owners/${id}`)
          .set(bearer(admin.token))
          .send(body)
          .expect(400);
      }
      for (const body of [
        { ownerIds: [id] },
        { ownerIds: ['nope'], assigneeId: null },
        { ownerIds: id, assigneeId: null },
        { ownerIds: [id], assigneeId: null, extra: 1 },
      ]) {
        await http()
          .post('/api/owners/assign')
          .set(bearer(admin.token))
          .send(body)
          .expect(400);
      }
      await http()
        .get('/api/owners/not-a-uuid')
        .set(bearer(admin.token))
        .expect(400);
      for (const query of [
        { status: 'OPEN' },
        { assignedTo: 'someone' },
        { importId: 'x' },
        { hasReminder: 'yes' },
        { unknown: 1 },
        { q: 'x'.repeat(101) },
      ]) {
        await http()
          .get('/api/owners')
          .query(query)
          .set(bearer(admin.token))
          .expect(400);
      }
      await http()
        .get('/api/reminders')
        .query({ unassigned: 'maybe' })
        .set(bearer(admin.token))
        .expect(400);
    });

    it('pagination: page 0, limit over the cap → 400; past the end → empty; limit 1 → hasNextPage', async () => {
      const tag = `${run}-page`;
      await seedOwner({ name: `${tag} 1` });
      await seedOwner({ name: `${tag} 2` });
      for (const path of [
        '/api/owners',
        '/api/owners/calling-list',
        `/api/owners/${randomUUID()}/notes`,
        `/api/owners/${randomUUID()}/timeline`,
        '/api/reminders',
      ]) {
        for (const query of [
          { page: 0 },
          { limit: 21 },
          { limit: 0 },
          { page: 'x' },
        ]) {
          await http()
            .get(path)
            .query(query)
            .set(bearer(admin.token))
            .expect(400);
        }
      }
      const one = await http()
        .get('/api/owners')
        .query({ q: tag, limit: 1 })
        .set(bearer(admin.token))
        .expect(200);
      expect(one.body.data).toHaveLength(1);
      expect(one.body.meta).toMatchObject({ total: 2, hasNextPage: true });
      const past = await http()
        .get('/api/owners')
        .query({ q: tag, page: 9 })
        .set(bearer(admin.token))
        .expect(200);
      expect(past.body.data).toEqual([]);
      expect(past.body.meta.total).toBe(2);
      const none = await http()
        .get('/api/owners')
        .query({ q: `${tag}-nothing` })
        .set(bearer(admin.token))
        .expect(200);
      expect(none.body).toMatchObject({ data: [], meta: { total: 0 } });
    });

    it('search text with %, _ and quotes matches literally; Arabic names are found', async () => {
      const tag = `${run}-q`;
      const pct = await seedOwner({ name: `${tag} 100% owner` });
      const under = await seedOwner({ name: `${tag} a_b` });
      const quote = await seedOwner({ name: `${tag} O'Brien "Jr"` });
      const arabic = await seedOwner({ name: `${tag} محمد عبد الله` });
      const find = async (q: string) => {
        const res = await http()
          .get('/api/owners')
          .query({ q })
          .set(bearer(admin.token))
          .expect(200);
        return (res.body.data as { id: string }[]).map((o) => o.id);
      };
      expect(await find(`${tag} 100%`)).toEqual([pct.id]);
      expect(await find('%')).toContain(pct.id);
      expect(await find('%')).not.toContain(under.id);
      expect(await find('_')).toContain(under.id);
      expect(await find('_')).not.toContain(pct.id);
      expect(await find(`${tag} a_b`)).toEqual([under.id]);
      expect(await find(`${tag} a_`)).toEqual([under.id]);
      expect(await find(`${tag} _`)).toEqual([]);
      expect(await find(`O'Brien "Jr"`)).toEqual([quote.id]);
      expect(await find('عبد الله')).toContain(arabic.id);
    });

    it('deleted id → 404 on every owner route', async () => {
      const { id } = await seedOwner({
        assignedToId: memberA.id,
        deletedAt: new Date(),
        deletedById: admin.id,
      });
      const as = bearer(admin.token);
      await http().get(`/api/owners/${id}`).set(as).expect(404);
      await http()
        .patch(`/api/owners/${id}`)
        .set(as)
        .send({ name: 'x' })
        .expect(404);
      await http().delete(`/api/owners/${id}`).set(as).expect(404);
      await http().get(`/api/owners/${id}/notes`).set(as).expect(404);
      await http()
        .post(`/api/owners/${id}/notes`)
        .set(as)
        .send({ body: 'x' })
        .expect(404);
      await http().get(`/api/owners/${id}/timeline`).set(as).expect(404);
      await http().get(`/api/owners/${randomUUID()}`).set(as).expect(404);
      const list = await http()
        .get('/api/owners')
        .query({ assignedTo: memberA.id, limit: 20 })
        .set(as)
        .expect(200);
      expect(list.body.data.map((o: { id: string }) => o.id)).not.toContain(id);
      expect(await callingList(memberA)).not.toContain(id);
    });

    it('phone formats: local, +20, 0020, spaces, dashes and brackets all store as E.164', async () => {
      const local = randomLocalMobile();
      const n = local.slice(1);
      const res = await createOwner(admin, {
        name: 'Formats',
        phones: [`0020${n}`],
      }).expect(201);
      expect(res.body.data.phones).toEqual([`+20${n}`]);
      for (const typed of [
        local,
        `+20${n}`,
        `${local.slice(0, 3)}-${local.slice(3, 7)}-${local.slice(7)}`,
        `(${local.slice(0, 3)}) ${local.slice(3)}`,
      ]) {
        const dup = await createOwner(admin, {
          name: 'Formats',
          phones: [typed],
        }).expect(409);
        expect(dup.body.error).toBe('PHONE_EXISTS');
      }
      const landline = await createOwner(admin, {
        name: 'Landline',
        phones: [`02 ${String(Date.now()).slice(-8)}`],
      }).expect(201);
      expect(landline.body.data.phones[0]).toMatch(/^\+202\d{8}$/);
    });
  });
});
