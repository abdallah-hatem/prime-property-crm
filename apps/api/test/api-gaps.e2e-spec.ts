import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import type { Prisma, PrismaClient, ReminderKind } from '@prisma/client';
import { PERMISSION_KEYS, TODAY_LIST_MAX } from '@prime-crm/shared';
import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { configureApp } from '../src/app.setup';
import { createTestDb, randomLocalMobile } from './helpers';
import {
  bearer,
  createUserWithToken,
  ensureBuiltInRoles,
} from './helpers-auth';

/**
 * T20 — API gaps the screens found: `Listing.adTakeDownOpen`, listing titles in the reader's
 * language everywhere a listing is labelled, true `/me/today` counts, and `GET /reminders`
 * filtered by `ownerId` / `listingId`. Each plan case is an `it` named after it, then the generic
 * checklist for the new query params.
 */

type Actor = Awaited<ReturnType<typeof createUserWithToken>>;

const e164 = (local: string) => `+20${local.slice(1)}`;
const DAY = 24 * 60 * 60 * 1000;
const AREA = 'الشيخ زايد';
const ARABIC_TITLE = `فيلا · 4 غرف · ${AREA}`;
const ENGLISH_TITLE = `Villa · 4 BR · ${AREA}`;

describe('API gaps (e2e)', () => {
  let app: INestApplication;
  let db: PrismaClient;
  const http = () => request(app.getHttpServer());
  const run = `T20-${Date.now()}`;

  let admin: Actor;
  let memberA: Actor;
  let memberB: Actor;
  const users: string[] = [];

  const as = (actor: Actor) => ({
    get: (path: string) => http().get(`/api${path}`).set(bearer(actor.token)),
    put: (path: string, body: object) =>
      http().put(`/api${path}`).set(bearer(actor.token)).send(body),
    post: (path: string, body: object = {}) =>
      http().post(`/api${path}`).set(bearer(actor.token)).send(body),
    delete: (path: string) =>
      http().delete(`/api${path}`).set(bearer(actor.token)),
  });

  async function newMember(label: string): Promise<Actor> {
    const { memberRoleId } = await ensureBuiltInRoles(db);
    const actor = await createUserWithToken(db, label, memberRoleId, []);
    users.push(actor.id);
    return actor;
  }

  async function seedOwner(
    fields: Partial<Prisma.OwnerUncheckedCreateInput> = {},
  ): Promise<string> {
    const owner = await db.owner.create({
      data: {
        name: `${run} owner`,
        createdById: admin.id,
        ...fields,
        phones: { create: [{ phone: e164(randomLocalMobile()), position: 0 }] },
      },
    });
    return owner.id;
  }

  async function seedListing(
    fields: Partial<Prisma.ListingUncheckedCreateInput> = {},
  ): Promise<string> {
    const listing = await db.listing.create({
      data: {
        purpose: 'SALE',
        type: 'VILLA',
        area: AREA,
        sizeSqm: 300,
        bedrooms: 4,
        price: 9_000_000,
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

  const ids = (rows: { id: string }[]) => rows.map((r) => r.id).sort();

  beforeAll(async () => {
    db = createTestDb();
    const { adminRoleId, memberRoleId } = await ensureBuiltInRoles(db);
    admin = await createUserWithToken(db, 't20-admin', adminRoleId, [
      ...PERMISSION_KEYS,
    ]);
    memberA = await createUserWithToken(db, 't20-a', memberRoleId, []);
    memberB = await createUserWithToken(db, 't20-b', memberRoleId, []);
    users.push(admin.id, memberA.id, memberB.id);

    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = moduleRef.createNestApplication();
    configureApp(app);
    await app.init();
  });

  afterAll(async () => {
    if (db) {
      const where = { in: users };
      await db.activityEntry.deleteMany({ where: { actorId: where } });
      await db.call.deleteMany({ where: { memberId: where } });
      await db.reminder.deleteMany({
        where: {
          OR: [
            { memberId: where },
            { createdById: where },
            { listing: { createdById: where } },
            { owner: { createdById: where } },
          ],
        },
      });
      await db.listing.deleteMany({ where: { createdById: where } });
      await db.owner.deleteMany({ where: { createdById: where } });
      await db.user.deleteMany({ where: { id: where } });
      await db.$disconnect();
    }
    await app?.close();
  });

  // ================================================================ plan cases

  it('`Listing.adTakeDownOpen` is true exactly while an AD_TAKE_DOWN task is open (business: take-down task)', async () => {
    const m = await newMember('t20-takedown');
    const id = await seedListing({ assignedToId: m.id });
    const open = async () =>
      (await as(m).get(`/listings/${id}`).expect(200)).body.data
        .adTakeDownOpen as boolean;

    expect(await open()).toBe(false);
    await as(m)
      .put(`/listings/${id}/ad`, {
        status: 'LIVE',
        link: 'https://www.propertyfinder.eg/en/plp/buy/villa-20.html',
      })
      .expect(200);
    // Live on an Available listing: a check-in, no take-down task.
    expect(await open()).toBe(false);

    await as(m).post(`/listings/${id}/status`, { status: 'SOLD' }).expect(200);
    expect(await open()).toBe(true);
    const tasks = await db.reminder.findMany({
      where: { listingId: id, kind: 'AD_TAKE_DOWN', doneAt: null },
    });
    expect(tasks).toHaveLength(1);

    await as(m).put(`/listings/${id}/ad`, { status: 'TAKEN_DOWN' }).expect(200);
    expect(await open()).toBe(false);
    // Anyone reading the listing sees the same flag.
    expect(
      (await as(memberB).get(`/listings/${id}`).expect(200)).body.data
        .adTakeDownOpen,
    ).toBe(false);
  });

  it("An Arabic user gets listing titles in Arabic in rows, detail, reminders and trash labels (contract: title in the reader's language)", async () => {
    const m = await newMember('t20-arabic');
    await db.user.update({ where: { id: m.id }, data: { language: 'ar' } });
    const listing = await seedListing({ assignedToId: m.id });
    const reminder = await seedReminder({
      listingId: listing,
      memberId: m.id,
      kind: 'AD_TAKE_DOWN',
      dueAt: new Date(Date.now() - 60_000),
    });

    // Search rows.
    const rows = (
      await as(m).get(`/listings?assignedTo=me&limit=20`).expect(200)
    ).body.data as { id: string; title: string }[];
    expect(rows.find((r) => r.id === listing)?.title).toBe(ARABIC_TITLE);
    // Detail.
    expect(
      (await as(m).get(`/listings/${listing}`).expect(200)).body.data.title,
    ).toBe(ARABIC_TITLE);
    // Reminders list.
    const list = (await as(m).get('/reminders').expect(200)).body.data as {
      id: string;
      listing: { title: string } | null;
    }[];
    expect(list.find((r) => r.id === reminder)?.listing?.title).toBe(
      ARABIC_TITLE,
    );
    // Today's ad tasks.
    const today = (await as(m).get('/me/today').expect(200)).body.data;
    expect(
      today.adTasks.find((r: { id: string }) => r.id === reminder)?.listing
        .title,
    ).toBe(ARABIC_TITLE);

    // Trash: an Arabic admin reads the label in Arabic, an English one in English; the
    // activity log keeps the English snapshot.
    await as(admin).delete(`/listings/${listing}`).expect(200);
    const trashLabel = async () =>
      (
        (await as(admin).get('/trash?kind=LISTING&limit=20').expect(200)).body
          .data as { id: string; label: string }[]
      ).find((t) => t.id === listing)?.label;
    expect(await trashLabel()).toBe(ENGLISH_TITLE);
    await db.user.update({
      where: { id: admin.id },
      data: { language: 'ar' },
    });
    try {
      expect(await trashLabel()).toBe(ARABIC_TITLE);
      const all = (await as(admin).get('/trash?limit=20').expect(200)).body
        .data as { id: string; label: string }[];
      expect(all.find((t) => t.id === listing)?.label).toBe(ARABIC_TITLE);
    } finally {
      await db.user.update({
        where: { id: admin.id },
        data: { language: 'en' },
      });
    }
    const entry = await db.activityEntry.findFirst({
      where: { type: 'DELETE', targetId: listing },
    });
    expect(entry?.summary).toBe(`Deleted listing ${ENGLISH_TITLE}`);
  });

  it('`/me/today` counts are true totals even when a list is capped at 50 (contract)', async () => {
    const m = await newMember('t20-counts');
    const owner = await seedOwner({ assignedToId: m.id });
    const listing = await seedListing({ assignedToId: m.id });
    const past = new Date(Date.now() - DAY);
    const over = TODAY_LIST_MAX + 5;

    await db.reminder.createMany({
      data: Array.from({ length: over }, (_, i) => ({
        ownerId: owner,
        memberId: m.id,
        kind: 'MANUAL' as const,
        dueAt: new Date(past.getTime() + i * 1000),
      })),
    });
    await db.reminder.createMany({
      data: Array.from({ length: over }, (_, i) => ({
        listingId: listing,
        memberId: m.id,
        kind: 'AD_CHECK_IN' as const,
        dueAt: new Date(past.getTime() + i * 1000),
      })),
    });
    await db.call.createMany({
      data: Array.from({ length: over }, () => ({
        ownerId: owner,
        ownerName: `${run} owner`,
        memberId: m.id,
        phone: e164(randomLocalMobile()),
        clientRequestId: randomUUID(),
      })),
    });

    const data = (await as(m).get('/me/today').expect(200)).body.data;
    expect(data.overdue).toHaveLength(TODAY_LIST_MAX);
    expect(data.adTasks).toHaveLength(TODAY_LIST_MAX);
    expect(data.outcomeMissing).toHaveLength(TODAY_LIST_MAX);
    expect(data.counts).toEqual({
      overdue: over,
      dueToday: 0,
      outcomeMissing: over,
      adTasks: over,
      callsToday: over,
      remindersOpen: 2 * over,
    });
  });

  it("`GET /reminders?ownerId=` returns only that owner's reminders, and 404 for an owner that isn't the caller's (invariant)", async () => {
    const m = await newMember('t20-owner-filter');
    const mine = await seedOwner({ assignedToId: m.id });
    const alsoMine = await seedOwner({ assignedToId: m.id });
    const theirs = await seedOwner({ assignedToId: memberB.id });
    const r1 = await seedReminder({ ownerId: mine, memberId: m.id });
    const r2 = await seedReminder({
      ownerId: mine,
      memberId: m.id,
      doneAt: new Date(),
    });
    // A reminder left with someone else (done, kept by its member) still shows on the owner.
    const r3 = await seedReminder({
      ownerId: mine,
      memberId: memberB.id,
      doneAt: new Date(),
    });
    await seedReminder({ ownerId: alsoMine, memberId: m.id });
    await seedReminder({ ownerId: theirs, memberId: memberB.id });

    const res = await as(m).get(`/reminders?ownerId=${mine}`).expect(200);
    expect(ids(res.body.data)).toEqual([r1, r2, r3].sort());
    expect(res.body.meta.total).toBe(3);
    // Filters combine: open ones only.
    const open = await as(m)
      .get(`/reminders?ownerId=${mine}&state=open`)
      .expect(200);
    expect(ids(open.body.data)).toEqual([r1]);

    const refused = await as(m).get(`/reminders?ownerId=${theirs}`).expect(404);
    expect(refused.body.error).toBe('NOT_FOUND');
    // owners.viewAll sees any owner's reminders.
    await as(admin).get(`/reminders?ownerId=${theirs}`).expect(200);
  });

  // ================================================================ generic checklist

  describe('generic checklist: ownerId / listingId', () => {
    it('a malformed id → 400; an unknown id → 404', async () => {
      for (const param of ['ownerId', 'listingId']) {
        await as(memberA).get(`/reminders?${param}=nope`).expect(400);
        await as(memberA).get(`/reminders?${param}=`).expect(400);
        await as(memberA)
          .get(`/reminders?${param}=${randomUUID()}`)
          .expect(404);
      }
    });

    it('a trashed owner or listing → 404, even for the admin', async () => {
      const owner = await seedOwner({
        assignedToId: memberA.id,
        deletedAt: new Date(),
        deletedById: admin.id,
      });
      const listing = await seedListing({
        assignedToId: memberA.id,
        deletedAt: new Date(),
        deletedById: admin.id,
      });
      await as(memberA).get(`/reminders?ownerId=${owner}`).expect(404);
      await as(admin).get(`/reminders?ownerId=${owner}`).expect(404);
      await as(memberA).get(`/reminders?listingId=${listing}`).expect(404);
      await as(admin).get(`/reminders?listingId=${listing}`).expect(404);
    });

    it("listingId: own listing's reminders; another member's listing → 404; listings.manageAll sees it", async () => {
      const mine = await seedListing({ assignedToId: memberA.id });
      const theirs = await seedListing({ assignedToId: memberB.id });
      const unassigned = await seedListing();
      const r = await seedReminder({
        listingId: mine,
        memberId: memberA.id,
        kind: 'AD_CHECK_IN',
      });
      await seedReminder({
        listingId: theirs,
        memberId: memberB.id,
        kind: 'AD_CHECK_IN',
      });
      const res = await as(memberA)
        .get(`/reminders?listingId=${mine}`)
        .expect(200);
      expect(ids(res.body.data)).toEqual([r]);
      await as(memberA).get(`/reminders?listingId=${theirs}`).expect(404);
      await as(memberA).get(`/reminders?listingId=${unassigned}`).expect(404);
      const adminView = await as(admin)
        .get(`/reminders?listingId=${theirs}`)
        .expect(200);
      expect(adminView.body.data).toHaveLength(1);
    });

    it('an unassigned owner: 404 for a member, visible to owners.viewAll', async () => {
      const owner = await seedOwner();
      const r = await seedReminder({ ownerId: owner, memberId: null });
      await as(memberA).get(`/reminders?ownerId=${owner}`).expect(404);
      const res = await as(admin)
        .get(`/reminders?ownerId=${owner}`)
        .expect(200);
      expect(ids(res.body.data)).toEqual([r]);
    });

    it("ownerId with memberId narrows to that member; another member's memberId still needs analytics.view", async () => {
      const owner = await seedOwner({ assignedToId: memberA.id });
      const own = await seedReminder({ ownerId: owner, memberId: memberA.id });
      await seedReminder({
        ownerId: owner,
        memberId: memberB.id,
        doneAt: new Date(),
      });
      const res = await as(memberA)
        .get(`/reminders?ownerId=${owner}&memberId=${memberA.id}`)
        .expect(200);
      expect(ids(res.body.data)).toEqual([own]);
      await as(memberA)
        .get(`/reminders?ownerId=${owner}&memberId=${memberB.id}`)
        .expect(403);
    });

    it("pagination: limit over the cap → 400, pages split the owner's reminders", async () => {
      const owner = await seedOwner({ assignedToId: memberA.id });
      await db.reminder.createMany({
        data: Array.from({ length: 3 }, (_, i) => ({
          ownerId: owner,
          memberId: memberA.id,
          kind: 'MANUAL' as const,
          dueAt: new Date(Date.now() + DAY + i * 1000),
        })),
      });
      await as(memberA).get(`/reminders?ownerId=${owner}&limit=21`).expect(400);
      const p1 = await as(memberA)
        .get(`/reminders?ownerId=${owner}&limit=2&page=1`)
        .expect(200);
      const p2 = await as(memberA)
        .get(`/reminders?ownerId=${owner}&limit=2&page=2`)
        .expect(200);
      expect(p1.body.data).toHaveLength(2);
      expect(p2.body.data).toHaveLength(1);
      expect(p1.body.meta).toMatchObject({ total: 3, hasNextPage: true });
    });

    it('no token → 401', async () => {
      await http().get(`/api/reminders?ownerId=${randomUUID()}`).expect(401);
    });
  });
});
