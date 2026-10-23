import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import type { Prisma, PrismaClient } from '@prisma/client';
import { getPayloadFromClientToken } from '@vercel/blob/client';
import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { configureApp } from '../src/app.setup';
import { Clock } from '../src/common/providers/clock';
import { BlobConfig } from '../src/domains/uploads/blob.config';
import { createTestDb, randomLocalMobile } from './helpers';
import {
  bearer,
  createUserWithToken,
  ensureBuiltInRoles,
  signExpiredToken,
} from './helpers-auth';

/**
 * T8 — listings, ad follow-up, photos and the Blob upload handshake. Every edge case of the
 * plan's T8 section is an `it` named after it, then the generic checklist (validation, auth,
 * pagination, `%`/`_` search, Arabic text, deleted ids, price bounds), restore rules and
 * concurrency. Photo uploads run against a fake Blob store: the handshake signs tokens offline
 * with a random token made here, so no real Blob credential is needed.
 */

type Actor = Awaited<ReturnType<typeof createUserWithToken>>;

const e164 = (local: string) => `+20${local.slice(1)}`;
const DAY = 24 * 60 * 60 * 1000;
const STORE_HOST = 't8teststore.private.blob.vercel-storage.com';
const FAKE_BLOB_TOKEN = `vercel_blob_rw_t8teststore_${randomUUID().replace(/-/g, '')}`;

describe('Listings, ads and photos (e2e)', () => {
  let app: INestApplication;
  let db: PrismaClient;
  let frozen: Date | null = null;
  const http = () => request(app.getHttpServer());
  const run = `T8-${Date.now()}`;
  /** Every listing this spec makes sits in its own area, so searches see only them. */
  const AREA = `${run} Zayed`;

  let admin: Actor;
  let memberA: Actor;
  let memberB: Actor;
  let lead: Actor; // owners.assign only
  let creator: Actor; // listings.create only
  let inactive: Actor;
  const users: string[] = [];
  const roles: string[] = [];
  let settingBefore = 7;

  // ---------------------------------------------------------------- fixtures

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
        area: AREA,
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

  const directBody = (extra: object = {}) => ({
    ownerName: 'أحمد علي',
    ownerPhone: randomLocalMobile(),
    purpose: 'SALE',
    type: 'VILLA',
    area: AREA,
    sizeSqm: 300,
    bedrooms: 4,
    price: 9_000_000,
    ...extra,
  });

  const as = (actor: Actor) => ({
    get: (path: string) => http().get(`/api${path}`).set(bearer(actor.token)),
    post: (path: string, body: object = {}) =>
      http().post(`/api${path}`).set(bearer(actor.token)).send(body),
    patch: (path: string, body: object) =>
      http().patch(`/api${path}`).set(bearer(actor.token)).send(body),
    put: (path: string, body: object) =>
      http().put(`/api${path}`).set(bearer(actor.token)).send(body),
    delete: (path: string) =>
      http().delete(`/api${path}`).set(bearer(actor.token)),
  });

  const search = (actor: Actor, query = '') =>
    as(actor).get(`/listings?area=${encodeURIComponent(AREA)}${query}`);

  const reminders = (listingId: string, kind?: string, open?: boolean) =>
    db.reminder.findMany({
      where: {
        listingId,
        ...(kind && { kind: kind as never }),
        ...(open !== undefined && { doneAt: open ? null : { not: null } }),
      },
      orderBy: { createdAt: 'asc' },
    });

  const goLive = (actor: Actor, id: string) =>
    as(actor).put(`/listings/${id}/ad`, {
      status: 'LIVE',
      link: 'https://www.propertyfinder.eg/en/plp/buy/villa-1.html',
    });

  const photoBody = (listingId: string, file = `${randomUUID()}.jpg`) => {
    const pathname = `listings/${listingId}/${file}`;
    return { url: `https://${STORE_HOST}/${pathname}`, pathname };
  };

  // ---------------------------------------------------------------- lifecycle

  beforeAll(async () => {
    db = createTestDb();
    const { adminRoleId, memberRoleId } = await ensureBuiltInRoles(db);
    admin = await createUserWithToken(db, 't8-admin', adminRoleId, []);
    memberA = await createUserWithToken(db, 't8-a', memberRoleId, []);
    memberB = await createUserWithToken(db, 't8-b', memberRoleId, []);
    inactive = await createUserWithToken(db, 't8-off', memberRoleId, []);
    await db.user.update({
      where: { id: inactive.id },
      data: { active: false },
    });
    const leadRole = await db.role.create({
      data: { name: `${run} lead`, permissions: ['owners.assign'] },
    });
    const creatorRole = await db.role.create({
      data: { name: `${run} creator`, permissions: ['listings.create'] },
    });
    roles.push(leadRole.id, creatorRole.id);
    lead = await createUserWithToken(db, 't8-lead', leadRole.id, [
      'owners.assign',
    ]);
    creator = await createUserWithToken(db, 't8-creator', creatorRole.id, [
      'listings.create',
    ]);
    users.push(
      admin.id,
      memberA.id,
      memberB.id,
      inactive.id,
      lead.id,
      creator.id,
    );
    settingBefore =
      (await db.setting.findUnique({ where: { id: 1 } }))?.adCheckInDays ?? 7;
    await db.setting.upsert({
      where: { id: 1 },
      update: { adCheckInDays: 7 },
      create: { id: 1, adCheckInDays: 7 },
    });

    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(BlobConfig)
      .useValue({ token: () => FAKE_BLOB_TOKEN, hosts: () => [STORE_HOST] })
      .compile();
    app = moduleRef.createNestApplication();
    configureApp(app);
    await app.init();
    const clock = app.get(Clock);
    jest
      .spyOn(clock, 'now')
      .mockImplementation(() => (frozen ? new Date(frozen) : new Date()));
  });

  afterEach(async () => {
    frozen = null;
    await db.setting.update({ where: { id: 1 }, data: { adCheckInDays: 7 } });
  });

  afterAll(async () => {
    if (db) {
      const where = { in: users };
      await db.setting.update({
        where: { id: 1 },
        data: { adCheckInDays: settingBefore },
      });
      await db.activityEntry.deleteMany({ where: { actorId: where } });
      await db.reminder.deleteMany({
        where: { OR: [{ memberId: where }, { createdById: where }] },
      });
      await db.note.deleteMany({ where: { authorId: where } });
      await db.ownerAssignment.deleteMany({ where: { byId: where } });
      await db.photo.deleteMany({ where: { listing: { createdById: where } } });
      await db.listing.deleteMany({ where: { createdById: where } });
      await db.owner.deleteMany({ where: { createdById: where } });
      await db.user.deleteMany({ where: { id: where } });
      await db.role.deleteMany({ where: { id: { in: roles } } });
      await db.$disconnect();
    }
    await app?.close();
  });

  // ================================================================ search and phone

  describe('search and the phone rule', () => {
    it('Member searches listings → sees all Available listings, `ownerPhone` null + hidden for listings not assigned to them (invariant: phone hidden)', async () => {
      const mine = await seedListing({ assignedToId: memberA.id });
      const theirs = await seedListing({ assignedToId: memberB.id });
      const unassigned = await seedListing();
      const res = await search(memberA, '&limit=20').expect(200);
      const ids = res.body.data.map((r: { id: string }) => r.id);
      expect(ids).toEqual(expect.arrayContaining([mine, theirs, unassigned]));

      for (const id of [theirs, unassigned]) {
        const one = await as(memberA).get(`/listings/${id}`).expect(200);
        expect(one.body.data).toMatchObject({
          ownerPhone: null,
          ownerPhoneHidden: true,
        });
      }
    });

    it('Assigned member and admin see the phone (business rule)', async () => {
      const phone = e164(randomLocalMobile());
      const id = await seedListing({
        assignedToId: memberA.id,
        ownerPhone: phone,
      });
      for (const actor of [memberA, admin]) {
        const res = await as(actor).get(`/listings/${id}`).expect(200);
        expect(res.body.data).toMatchObject({
          ownerPhone: phone,
          ownerPhoneHidden: false,
        });
      }
      const other = await as(memberB).get(`/listings/${id}`).expect(200);
      expect(other.body.data.ownerPhone).toBeNull();
    });

    it('Phone never present in list rows for anyone (contract: ListingRow has no phone)', async () => {
      const phone = e164(randomLocalMobile());
      await seedListing({ assignedToId: memberA.id, ownerPhone: phone });
      for (const actor of [memberA, memberB, admin]) {
        const res = await search(actor).expect(200);
        expect(JSON.stringify(res.body.data)).not.toContain(phone.slice(3));
        for (const row of res.body.data) {
          expect(row).not.toHaveProperty('ownerPhone');
          expect(row).not.toHaveProperty('ownerName');
        }
      }
    });

    it('Default search returns only AVAILABLE (business)', async () => {
      const available = await seedListing();
      const sold = await seedListing({ status: 'SOLD' });
      const res = await search(memberA).expect(200);
      const ids = res.body.data.map((r: { id: string }) => r.id);
      expect(ids).toContain(available);
      expect(ids).not.toContain(sold);
      expect(
        res.body.data.every(
          (r: { status: string }) => r.status === 'AVAILABLE',
        ),
      ).toBe(true);
      const both = await search(memberA, '&status=AVAILABLE,SOLD').expect(200);
      expect(both.body.data.map((r: { id: string }) => r.id)).toEqual(
        expect.arrayContaining([available, sold]),
      );
    });

    it('Filters: priceMin > priceMax → 400; bedroomsMin 0 OK; floor negative (basement) allowed (checklist: bounds)', async () => {
      const bad = await search(memberA, '&priceMin=10&priceMax=5').expect(400);
      expect(bad.body.error).toBe('VALIDATION_FAILED');
      await search(memberA, '&bedroomsMin=0').expect(200);
      const basement = await seedListing({ floor: -1 });
      const res = await search(memberA, '&floorMin=-2&floorMax=-1').expect(200);
      expect(res.body.data.map((r: { id: string }) => r.id)).toEqual([
        basement,
      ]);
    });

    it('`q` search by phone digits never matches owner phones of listings not assigned to the caller (invariant: phone hidden)', async () => {
      const local = randomLocalMobile();
      const id = await seedListing({
        assignedToId: memberB.id,
        ownerPhone: e164(local),
      });
      for (const q of [local, local.slice(1), `+20${local.slice(1)}`]) {
        const a = await search(memberA, `&q=${encodeURIComponent(q)}`).expect(
          200,
        );
        expect(a.body.data).toEqual([]);
        const b = await search(memberB, `&q=${encodeURIComponent(q)}`).expect(
          200,
        );
        expect(b.body.data.map((r: { id: string }) => r.id)).toEqual([id]);
      }
      const all = await search(admin, `&q=${local}`).expect(200);
      expect(all.body.data.map((r: { id: string }) => r.id)).toEqual([id]);
    });

    it('sizeMin > sizeMax, floorMin > floorMax → 400 (checklist: bounds)', async () => {
      await search(memberA, '&sizeMin=200&sizeMax=100').expect(400);
      await search(memberA, '&floorMin=3&floorMax=1').expect(400);
      await search(memberA, '&sizeMin=100&sizeMax=100').expect(200);
    });

    it('Deleted listings never appear in search (contract: soft delete)', async () => {
      const id = await seedListing({
        deletedAt: new Date(),
        deletedById: admin.id,
      });
      for (const query of ['', '&status=AVAILABLE,SOLD,RENTED,OFF_MARKET']) {
        const res = await search(admin, query).expect(200);
        expect(res.body.data.map((r: { id: string }) => r.id)).not.toContain(
          id,
        );
      }
      await as(admin).get(`/listings/${id}`).expect(404);
    });

    it('filters by purpose, type, compound, price, size, rooms, ad status, assignee and check-in due; sorts', async () => {
      const villa = await seedListing({
        type: 'VILLA',
        purpose: 'RENT',
        compound: 'Allegria',
        price: 50_000,
        sizeSqm: 400,
        bedrooms: 5,
        bathrooms: 4,
        assignedToId: memberA.id,
      });
      const studio = await seedListing({
        type: 'STUDIO',
        price: 900_000,
        sizeSqm: 40,
        bedrooms: 0,
        bathrooms: 1,
        adStatus: 'LIVE',
        adLink: 'https://pf.example/1',
      });
      await db.reminder.create({
        data: {
          kind: 'AD_CHECK_IN',
          listingId: studio,
          dueAt: new Date(Date.now() - DAY),
        },
      });
      const ids = async (q: string) =>
        (await search(memberA, q).expect(200)).body.data.map(
          (r: { id: string }) => r.id,
        );
      expect(await ids('&purpose=RENT')).toEqual([villa]);
      expect(await ids('&type=VILLA&type=STUDIO&sort=priceAsc')).toEqual([
        villa,
        studio,
      ]);
      expect(await ids('&compound=allegria')).toEqual([villa]);
      expect(await ids('&priceMin=60000&priceMax=900000&type=STUDIO')).toEqual([
        studio,
      ]);
      expect(await ids('&sizeMin=300&sizeMax=500')).toEqual([villa]);
      expect(await ids('&bedroomsMin=5&bathroomsMin=4')).toEqual([villa]);
      expect(await ids('&adStatus=LIVE')).toEqual([studio]);
      expect(await ids('&assignedTo=me&type=VILLA')).toEqual([villa]);
      expect(await ids(`&assignedTo=${memberA.id}&type=VILLA`)).toEqual([
        villa,
      ]);
      expect(await ids('&assignedTo=unassigned&type=STUDIO')).toEqual([studio]);
      expect(await ids('&checkInDue=true')).toEqual([studio]);
      expect(await ids('&checkInDue=false&type=STUDIO')).toEqual([]);
      const row = (await search(memberA, '&type=STUDIO').expect(200)).body
        .data[0];
      expect(row.checkInDue).toBe(true);
      const bySize = await ids('&type=VILLA,STUDIO&sort=sizeDesc');
      expect(bySize).toEqual([villa, studio]);
      expect(await ids('&type=VILLA,STUDIO&sort=priceDesc')).toEqual([
        studio,
        villa,
      ]);
    });
  });

  // ================================================================ create

  describe('create', () => {
    it('Create from own INTERESTED owner → prefilled contact, owner becomes LISTED, leaves calling list (flow 4)', async () => {
      const owner = await seedOwner({
        assignedToId: memberA.id,
        status: 'INTERESTED',
        name: 'محمد حسن',
      });
      const before = await as(memberA)
        .get('/owners/calling-list?limit=20')
        .expect(200);
      expect(before.body.meta.total).toBeGreaterThan(0);

      const { ownerName: _n, ownerPhone: _p, ...fields } = directBody();
      const res = await as(memberA)
        .post('/listings', { ownerId: owner.id, ...fields })
        .expect(201);
      expect(res.body.data).toMatchObject({
        ownerId: owner.id,
        ownerName: 'محمد حسن',
        ownerPhone: e164(owner.phones[0]),
        ownerPhoneHidden: false,
        assignedTo: { id: memberA.id },
        status: 'AVAILABLE',
        adStatus: 'NOT_POSTED',
        title: 'Villa · 4 BR · ' + AREA,
      });
      expect(
        (await db.owner.findUniqueOrThrow({ where: { id: owner.id } })).status,
      ).toBe('LISTED');
      const after = await as(memberA)
        .get('/owners/calling-list?limit=20')
        .expect(200);
      expect(after.body.data.map((o: { id: string }) => o.id)).not.toContain(
        owner.id,
      );
    });

    it("Create from another member's owner → 404 (invariant)", async () => {
      const owner = await seedOwner({ assignedToId: memberB.id });
      const { ownerName: _n, ownerPhone: _p, ...fields } = directBody();
      const res = await as(memberA)
        .post('/listings', { ownerId: owner.id, ...fields })
        .expect(404);
      expect(res.body.error).toBe('NOT_FOUND');
      await as(memberA)
        .post('/listings', { ownerId: (await seedOwner()).id, ...fields })
        .expect(404);
      expect(await db.listing.count({ where: { ownerId: owner.id } })).toBe(0);
    });

    it('Create from an owner already listed → 409 OWNER_ALREADY_LISTED (business: one listing links one owner)', async () => {
      const owner = await seedOwner({ assignedToId: memberA.id });
      const { ownerName: _n, ownerPhone: _p, ...fields } = directBody();
      await as(memberA)
        .post('/listings', { ownerId: owner.id, ...fields })
        .expect(201);
      const res = await as(memberA)
        .post('/listings', { ownerId: owner.id, ...fields })
        .expect(409);
      expect(res.body.error).toBe('OWNER_ALREADY_LISTED');
    });

    it('Direct create without `listings.create` → 403 (role)', async () => {
      const res = await as(memberA).post('/listings', directBody()).expect(403);
      expect(res.body.error).toBe('FORBIDDEN');
      const ok = await as(creator).post('/listings', directBody()).expect(201);
      expect(ok.body.data.assignedTo).toMatchObject({ id: creator.id });
    });

    it('Direct create whose phone matches an owner lead → linked and lead becomes LISTED (flow 5)', async () => {
      const local = randomLocalMobile();
      const owner = await seedOwner({
        assignedToId: memberB.id,
        phones: [randomLocalMobile(), local],
      });
      await db.reminder.create({
        data: {
          ownerId: owner.id,
          memberId: memberB.id,
          dueAt: new Date(Date.now() + DAY),
        },
      });
      const typed = `+20 ${local.slice(1, 4)} ${local.slice(4)}`;
      const res = await as(admin)
        .post(
          '/listings',
          directBody({ ownerPhone: typed, assignedTo: memberA.id }),
        )
        .expect(201);
      expect(res.body.data).toMatchObject({
        ownerId: owner.id,
        ownerPhone: e164(local),
        assignedTo: { id: memberA.id },
      });
      const after = await db.owner.findUniqueOrThrow({
        where: { id: owner.id },
      });
      expect(after).toMatchObject({
        status: 'LISTED',
        assignedToId: memberA.id,
      });
      // The owner's open reminders followed it; the move is logged once.
      expect(
        await db.reminder.count({
          where: { ownerId: owner.id, memberId: memberA.id },
        }),
      ).toBe(1);
      expect(
        await db.activityEntry.count({
          where: { type: 'ASSIGN', actorId: admin.id, targetId: memberA.id },
        }),
      ).toBeGreaterThanOrEqual(1);

      // Without assignedTo, a direct listing is the creator's and the linked lead moves to them.
      const other = await seedOwner({ assignedToId: memberB.id });
      const byCreator = await as(creator)
        .post('/listings', directBody({ ownerPhone: other.phones[0] }))
        .expect(201);
      expect(byCreator.body.data).toMatchObject({
        ownerId: other.id,
        assignedTo: { id: creator.id },
      });
      expect(
        (await db.owner.findUniqueOrThrow({ where: { id: other.id } }))
          .assignedToId,
      ).toBe(creator.id);
    });

    it("Direct create whose phone is already another listing's owner phone → 409 PHONE_IN_LISTING (decision: duplicate detection)", async () => {
      const local = randomLocalMobile();
      await seedListing({ ownerPhone: e164(local) });
      const res = await as(admin)
        .post('/listings', directBody({ ownerPhone: `0020${local.slice(1)}` }))
        .expect(409);
      expect(res.body.error).toBe('PHONE_IN_LISTING');
    });

    it('Direct create with a phone of a trashed owner → 409 PHONE_IN_TRASH (decision)', async () => {
      const owner = await seedOwner({
        deletedAt: new Date(),
        deletedById: admin.id,
      });
      const res = await as(admin)
        .post('/listings', directBody({ ownerPhone: owner.phones[0] }))
        .expect(409);
      expect(res.body.error).toBe('PHONE_IN_TRASH');
      expect(res.body.data).toMatchObject({ ownerId: owner.id });
      // Without trash.restore the caller only hears that the phone is taken.
      const plain = await as(creator)
        .post('/listings', directBody({ ownerPhone: owner.phones[0] }))
        .expect(409);
      expect(plain.body.error).toBe('PHONE_EXISTS');
      expect(plain.body.data).toBeUndefined();
    });

    // Also T1: "Price stored as integer EGP; a fractional price is rejected by the DTO layer later, schema has `Int` (money: whole EGP)".
    it('Price as a fraction or negative, size 0 → 400 (money: whole EGP) — a fractional price is rejected by the DTO layer, schema has `Int`', async () => {
      for (const extra of [
        { price: 1500.5 },
        { price: -1 },
        { sizeSqm: 0 },
        { sizeSqm: 99.5 },
      ]) {
        const res = await as(admin)
          .post('/listings', directBody(extra))
          .expect(400);
        expect(res.body.error).toBe('VALIDATION_FAILED');
      }
    });

    it('Price 1,000,000,001 → 400 (money) — Price over 1,000,000,000 EGP → 400 at the DTO, never a DB overflow 500 (money: whole EGP; review)', async () => {
      await as(admin)
        .post('/listings', directBody({ price: 1_000_000_001 }))
        .expect(400);
    });

    it('Price 0 → 400; price 1 and 1,000,000,000 accepted (money: 1 – 1,000,000,000)', async () => {
      await as(admin)
        .post('/listings', directBody({ price: 0 }))
        .expect(400);
      for (const price of [1, 1_000_000_000]) {
        const res = await as(admin)
          .post('/listings', directBody({ price }))
          .expect(201);
        expect(res.body.data.price).toBe(price);
        expect(
          (
            await db.listing.findUniqueOrThrow({
              where: { id: res.body.data.id },
            })
          ).price,
        ).toBe(price);
      }
    });

    it("`POST /listings` with `assignedTo` by a user without `owners.assign` → 403; `PATCH /listings/:id` doesn't accept `assignedTo` (role: only assigners assign)", async () => {
      const res = await as(creator)
        .post('/listings', directBody({ assignedTo: memberA.id }))
        .expect(403);
      expect(res.body.error).toBe('FORBIDDEN');
      const owner = await seedOwner({ assignedToId: memberA.id });
      const { ownerName: _n, ownerPhone: _p, ...fields } = directBody();
      await as(memberA)
        .post('/listings', {
          ownerId: owner.id,
          ...fields,
          assignedTo: memberB.id,
        })
        .expect(403);

      const id = await seedListing({ assignedToId: memberA.id });
      const patch = await as(memberA)
        .patch(`/listings/${id}`, { assignedTo: memberB.id })
        .expect(400);
      expect(patch.body.error).toBe('VALIDATION_FAILED');
      await as(admin)
        .patch(`/listings/${id}`, { ownerId: owner.id })
        .expect(400);
      expect(
        (await db.listing.findUniqueOrThrow({ where: { id } })).assignedToId,
      ).toBe(memberA.id);
    });

    it('create: inactive assignee → 400 INVALID_ASSIGNEE; ownerId with a contact, or a contact half → 400', async () => {
      const bad = await as(admin)
        .post('/listings', directBody({ assignedTo: inactive.id }))
        .expect(400);
      expect(bad.body.error).toBe('INVALID_ASSIGNEE');
      const owner = await seedOwner({ assignedToId: memberA.id });
      await as(memberA)
        .post('/listings', directBody({ ownerId: owner.id }))
        .expect(400);
      const { ownerPhone: _p, ...half } = directBody();
      await as(admin).post('/listings', half).expect(400);
    });
  });

  // ================================================================ edit

  describe('edit', () => {
    it('Member edits a listing not assigned to them → 403 (role)', async () => {
      const id = await seedListing({ assignedToId: memberB.id });
      const res = await as(memberA)
        .patch(`/listings/${id}`, { price: 100 })
        .expect(403);
      expect(res.body.error).toBe('FORBIDDEN');
      for (const [path, body] of [
        [`/listings/${id}/status`, { status: 'SOLD' }],
        [`/listings/${id}/ad/check-in`, { stillAvailable: true }],
        [`/listings/${id}/notes`, { body: 'x' }],
      ] as const) {
        await as(memberA).post(path, body).expect(403);
      }
      await as(memberA)
        .put(`/listings/${id}/ad`, { status: 'TAKEN_DOWN' })
        .expect(403);
      await as(memberB).patch(`/listings/${id}`, { price: 100 }).expect(200);
      await as(admin).patch(`/listings/${id}`, { price: 200 }).expect(200);
    });

    it('edit: fields update, null clears, a phone of another listing or owner → 409', async () => {
      const id = await seedListing({
        assignedToId: memberA.id,
        compound: 'Old',
        floor: 3,
      });
      const res = await as(memberA)
        .patch(`/listings/${id}`, {
          compound: null,
          floor: null,
          description: '  شقة بحري ✨ ',
          furnishing: 'FURNISHED',
          bedrooms: 2,
        })
        .expect(200);
      expect(res.body.data).toMatchObject({
        compound: null,
        floor: null,
        description: 'شقة بحري ✨',
        furnishing: 'FURNISHED',
        title: `Apartment · 2 BR · ${AREA}`,
      });

      const taken = randomLocalMobile();
      await seedListing({ ownerPhone: e164(taken) });
      const clash = await as(memberA)
        .patch(`/listings/${id}`, { ownerPhone: taken })
        .expect(409);
      expect(clash.body.error).toBe('PHONE_IN_LISTING');
      const owner = await seedOwner();
      const ownerClash = await as(memberA)
        .patch(`/listings/${id}`, { ownerPhone: owner.phones[0] })
        .expect(409);
      expect(ownerClash.body.error).toBe('PHONE_EXISTS');
      const fresh = randomLocalMobile();
      const ok = await as(memberA)
        .patch(`/listings/${id}`, { ownerPhone: fresh, ownerName: 'Sara' })
        .expect(200);
      expect(ok.body.data).toMatchObject({
        ownerPhone: e164(fresh),
        ownerName: 'Sara',
      });
    });
  });

  // ================================================================ ad lifecycle

  describe('ad lifecycle', () => {
    it('Ad → LIVE without link → 400 AD_LINK_REQUIRED; on a non-AVAILABLE listing → 400 (business: Live only when Available)', async () => {
      const id = await seedListing({ assignedToId: memberA.id });
      const res = await as(memberA)
        .put(`/listings/${id}/ad`, { status: 'LIVE' })
        .expect(400);
      expect(res.body.error).toBe('AD_LINK_REQUIRED');
      const sold = await seedListing({
        assignedToId: memberA.id,
        status: 'SOLD',
      });
      const notAvailable = await goLive(memberA, sold).expect(400);
      expect(notAvailable.body.error).toBe('LISTING_NOT_AVAILABLE');
      expect(await reminders(sold)).toEqual([]);
      // A malformed link is a validation error.
      await as(memberA)
        .put(`/listings/${id}/ad`, {
          status: 'LIVE',
          link: 'javascript:alert(1)',
        })
        .expect(400);
    });

    it('Ad → LIVE creates one AD_CHECK_IN due now + interval days (business: weekly check-in)', async () => {
      frozen = new Date('2026-10-22T09:00:00.000Z');
      const id = await seedListing({ assignedToId: memberA.id });
      const res = await goLive(memberA, id).expect(200);
      expect(res.body.data.ad).toMatchObject({
        status: 'LIVE',
        postedAt: frozen.toISOString(),
        nextCheckInAt: new Date(frozen.getTime() + 7 * DAY).toISOString(),
      });
      // Saving Live again (a new link) does not add a second check-in.
      await as(memberA)
        .put(`/listings/${id}/ad`, {
          status: 'LIVE',
          link: 'https://pf.example/2',
        })
        .expect(200);
      const checkIns = await reminders(id, 'AD_CHECK_IN', true);
      expect(checkIns).toHaveLength(1);
      expect(checkIns[0]).toMatchObject({
        memberId: memberA.id,
        dueAt: new Date(frozen.getTime() + 7 * DAY),
      });
    });

    it('Check-in with stillAvailable → closes the open check-in, records date, schedules next with the current interval (flow 7)', async () => {
      const id = await seedListing({ assignedToId: memberA.id });
      await goLive(memberA, id).expect(200);
      const first = (await reminders(id, 'AD_CHECK_IN'))[0];
      await db.setting.update({ where: { id: 1 }, data: { adCheckInDays: 3 } });
      frozen = new Date(Date.now() + 7 * DAY);
      const res = await as(memberA)
        .post(`/listings/${id}/ad/check-in`, {
          stillAvailable: true,
          note: 'المالك أكد أنها متاحة',
        })
        .expect(200);
      expect(res.body.data.ad).toMatchObject({
        lastCheckInAt: frozen.toISOString(),
        nextCheckInAt: new Date(frozen.getTime() + 3 * DAY).toISOString(),
      });
      expect(res.body.data.notes[0].body).toBe('المالك أكد أنها متاحة');
      const all = await reminders(id, 'AD_CHECK_IN');
      expect(all).toHaveLength(2);
      expect(all.find((r) => r.id === first.id)?.doneAt).not.toBeNull();
      expect(all.filter((r) => r.doneAt === null)).toHaveLength(1);
    });

    it('Check-in with stillAvailable=false → listing OFF_MARKET + AD_TAKE_DOWN task (business: check-in outcome)', async () => {
      const id = await seedListing({ assignedToId: memberA.id });
      await goLive(memberA, id).expect(200);
      const res = await as(memberA)
        .post(`/listings/${id}/ad/check-in`, { stillAvailable: false })
        .expect(200);
      expect(res.body.data).toMatchObject({ status: 'OFF_MARKET' });
      expect(res.body.data.ad.nextCheckInAt).toBeNull();
      expect(await reminders(id, 'AD_CHECK_IN', true)).toEqual([]);
      const takeDown = await reminders(id, 'AD_TAKE_DOWN', true);
      expect(takeDown).toHaveLength(1);
      expect(takeDown[0].memberId).toBe(memberA.id);
    });

    it('Check-in when ad not LIVE → 400 (contract)', async () => {
      const id = await seedListing({ assignedToId: memberA.id });
      const res = await as(memberA)
        .post(`/listings/${id}/ad/check-in`, { stillAvailable: true })
        .expect(400);
      expect(res.body.error).toBe('AD_NOT_LIVE');
      const sold = await seedListing({
        assignedToId: memberA.id,
        status: 'SOLD',
        adStatus: 'LIVE',
        adLink: 'https://pf.example/3',
      });
      const notAvailable = await as(memberA)
        .post(`/listings/${sold}/ad/check-in`, { stillAvailable: true })
        .expect(400);
      expect(notAvailable.body.error).toBe('LISTING_NOT_AVAILABLE');
    });

    it('Status → SOLD/RENTED/OFF_MARKET while LIVE → AD_TAKE_DOWN task created once (not twice on a second status change) (business + checklist: duplicates)', async () => {
      for (const status of ['SOLD', 'RENTED', 'OFF_MARKET']) {
        const id = await seedListing({ assignedToId: memberA.id });
        await goLive(memberA, id).expect(200);
        await as(memberA)
          .post(`/listings/${id}/status`, { status })
          .expect(200);
        await as(memberA)
          .post(`/listings/${id}/status`, { status: 'RENTED' })
          .expect(200);
        await as(memberA)
          .post(`/listings/${id}/status`, { status })
          .expect(200);
        // Back to Available and away again: the open task is not doubled.
        await as(memberA)
          .post(`/listings/${id}/status`, { status: 'AVAILABLE' })
          .expect(200);
        await as(memberA)
          .post(`/listings/${id}/status`, { status })
          .expect(200);
        expect(await reminders(id, 'AD_TAKE_DOWN')).toHaveLength(1);
      }
    });

    it('Status change when ad NOT_POSTED → no take-down task (business)', async () => {
      const id = await seedListing({ assignedToId: memberA.id });
      await as(memberA)
        .post(`/listings/${id}/status`, { status: 'SOLD' })
        .expect(200);
      expect(await reminders(id)).toEqual([]);
    });

    it('Status OFF_MARKET with ad NOT_POSTED or TAKEN_DOWN → no task (business)', async () => {
      const notPosted = await seedListing({ assignedToId: memberA.id });
      const takenDown = await seedListing({
        assignedToId: memberA.id,
        adStatus: 'TAKEN_DOWN',
        adLink: 'https://pf.example/4',
      });
      for (const id of [notPosted, takenDown]) {
        await as(memberA)
          .post(`/listings/${id}/status`, { status: 'OFF_MARKET' })
          .expect(200);
        expect(await reminders(id)).toEqual([]);
      }
    });

    it('Ad → TAKEN_DOWN closes the take-down task and any open check-in (business)', async () => {
      frozen = new Date('2026-10-22T09:00:00.000Z');
      const id = await seedListing({ assignedToId: memberA.id });
      await goLive(memberA, id).expect(200);
      await as(memberA)
        .post(`/listings/${id}/status`, { status: 'SOLD' })
        .expect(200);
      // A stray check-in (e.g. from the safety-net cron) closes too.
      await db.reminder.create({
        data: {
          kind: 'AD_CHECK_IN',
          listingId: id,
          memberId: memberA.id,
          dueAt: new Date(Date.now() + DAY),
        },
      });
      const res = await as(memberA)
        .put(`/listings/${id}/ad`, { status: 'TAKEN_DOWN' })
        .expect(200);
      expect(res.body.data.ad).toMatchObject({
        status: 'TAKEN_DOWN',
        takenDownAt: frozen.toISOString(),
        link: 'https://www.propertyfinder.eg/en/plp/buy/villa-1.html',
      });
      expect(await reminders(id, undefined, true)).toEqual([]);
      expect((await reminders(id, 'AD_TAKE_DOWN'))[0].doneAt).not.toBeNull();
      // The take-down task can't be closed by hand (T7), only by this.
    });

    it('Listing leaving AVAILABLE closes its open check-in (business: no check-ins after sale)', async () => {
      const id = await seedListing({ assignedToId: memberA.id });
      await goLive(memberA, id).expect(200);
      expect(await reminders(id, 'AD_CHECK_IN', true)).toHaveLength(1);
      await as(memberA)
        .post(`/listings/${id}/status`, { status: 'RENTED' })
        .expect(200);
      expect(await reminders(id, 'AD_CHECK_IN', true)).toEqual([]);
      // Back to Available with the ad still Live: check-ins resume (one).
      await as(memberA)
        .post(`/listings/${id}/status`, { status: 'AVAILABLE' })
        .expect(200);
      expect(await reminders(id, 'AD_CHECK_IN', true)).toHaveLength(1);
    });

    it('two status changes at once open one take-down task (concurrency)', async () => {
      const id = await seedListing({ assignedToId: memberA.id });
      await goLive(memberA, id).expect(200);
      const [a, b] = await Promise.all([
        as(memberA).post(`/listings/${id}/status`, { status: 'SOLD' }),
        as(admin).post(`/listings/${id}/status`, { status: 'RENTED' }),
      ]);
      expect([a.status, b.status]).toEqual([200, 200]);
      expect(await reminders(id, 'AD_TAKE_DOWN')).toHaveLength(1);
    });

    it('ad back to NOT_POSTED stops check-ins; TAKEN_DOWN → LIVE again restarts them', async () => {
      const id = await seedListing({ assignedToId: memberA.id });
      await goLive(memberA, id).expect(200);
      const off = await as(memberA)
        .put(`/listings/${id}/ad`, { status: 'NOT_POSTED', link: null })
        .expect(200);
      expect(off.body.data.ad).toMatchObject({
        status: 'NOT_POSTED',
        link: null,
        postedAt: null,
      });
      expect(await reminders(id, 'AD_CHECK_IN', true)).toEqual([]);
      await goLive(memberA, id).expect(200);
      await as(memberA)
        .put(`/listings/${id}/ad`, { status: 'TAKEN_DOWN' })
        .expect(200);
      const again = await goLive(memberA, id).expect(200);
      expect(again.body.data.ad.takenDownAt).toBeNull();
      expect(await reminders(id, 'AD_CHECK_IN', true)).toHaveLength(1);
    });
  });

  // ================================================================ assign

  describe('assign', () => {
    it('Reassign listing moves open reminders (flow: reassign)', async () => {
      const owner = await seedOwner({
        assignedToId: memberA.id,
        status: 'LISTED',
      });
      const id = await seedListing({
        assignedToId: memberA.id,
        ownerId: owner.id,
      });
      await goLive(memberA, id).expect(200);
      const done = await db.reminder.create({
        data: {
          listingId: id,
          memberId: memberA.id,
          dueAt: new Date(),
          doneAt: new Date(),
        },
      });
      const res = await as(lead)
        .post('/listings/assign', { listingIds: [id], assigneeId: memberB.id })
        .expect(200);
      expect(res.body.data).toEqual({ moved: 1 });
      const open = await reminders(id, undefined, true);
      expect(open.length).toBeGreaterThan(0);
      expect(open.every((r) => r.memberId === memberB.id)).toBe(true);
      expect(
        (await db.reminder.findUniqueOrThrow({ where: { id: done.id } }))
          .memberId,
      ).toBe(memberA.id);
      // The linked owner follows.
      expect(
        (await db.owner.findUniqueOrThrow({ where: { id: owner.id } }))
          .assignedToId,
      ).toBe(memberB.id);
    });

    it('After a listing is reassigned, the old member no longer sees the phone and the new one does (invariant)', async () => {
      const phone = e164(randomLocalMobile());
      const id = await seedListing({
        assignedToId: memberA.id,
        ownerPhone: phone,
      });
      expect(
        (await as(memberA).get(`/listings/${id}`)).body.data.ownerPhone,
      ).toBe(phone);
      await as(admin)
        .post('/listings/assign', { listingIds: [id], assigneeId: memberB.id })
        .expect(200);
      const old = await as(memberA).get(`/listings/${id}`).expect(200);
      expect(old.body.data).toMatchObject({
        ownerPhone: null,
        ownerPhoneHidden: true,
      });
      const now = await as(memberB).get(`/listings/${id}`).expect(200);
      expect(now.body.data.ownerPhone).toBe(phone);
    });

    it('`/listings/assign` without `owners.assign` → 403; inactive assignee → 400; 501 ids → 400 (role + contract)', async () => {
      const id = await seedListing({ assignedToId: memberA.id });
      await as(memberA)
        .post('/listings/assign', { listingIds: [id], assigneeId: memberA.id })
        .expect(403);
      const inactiveRes = await as(lead)
        .post('/listings/assign', { listingIds: [id], assigneeId: inactive.id })
        .expect(400);
      expect(inactiveRes.body.error).toBe('INVALID_ASSIGNEE');
      const many = Array.from({ length: 501 }, () => randomUUID());
      await as(lead)
        .post('/listings/assign', { listingIds: many, assigneeId: null })
        .expect(400);
      const max = [id, ...Array.from({ length: 499 }, () => randomUUID())];
      const ok = await as(lead)
        .post('/listings/assign', { listingIds: max, assigneeId: null })
        .expect(200);
      expect(ok.body.data).toEqual({ moved: 1 });
    });

    it('`/listings/assign` writes one activity entry per batch (business: activity log)', async () => {
      const ids = [
        await seedListing(),
        await seedListing(),
        await seedListing(),
      ];
      const deleted = await seedListing({
        deletedAt: new Date(),
        deletedById: admin.id,
      });
      const since = new Date();
      await as(lead)
        .post('/listings/assign', {
          listingIds: [...ids, deleted],
          assigneeId: memberB.id,
        })
        .expect(200);
      const entries = await db.activityEntry.findMany({
        where: { actorId: lead.id, type: 'ASSIGN', createdAt: { gte: since } },
      });
      expect(entries).toHaveLength(1);
      expect(entries[0]).toMatchObject({
        targetId: memberB.id,
        details: { kind: 'LISTINGS', count: 3, assigneeId: memberB.id },
      });
      // A batch that moves nothing writes nothing.
      await as(lead)
        .post('/listings/assign', {
          listingIds: [deleted],
          assigneeId: memberB.id,
        })
        .expect(200);
      expect(
        await db.activityEntry.count({
          where: {
            actorId: lead.id,
            type: 'ASSIGN',
            createdAt: { gte: since },
          },
        }),
      ).toBe(1);
    });
  });

  // ================================================================ delete and restore

  describe('delete and restore', () => {
    it('Delete listing → to trash; linked owner back to INTERESTED (business)', async () => {
      const owner = await seedOwner({
        assignedToId: memberA.id,
        status: 'LISTED',
      });
      const id = await seedListing({
        assignedToId: memberA.id,
        ownerId: owner.id,
      });
      await as(admin).delete(`/listings/${id}`).expect(200);
      const row = await db.listing.findUniqueOrThrow({ where: { id } });
      expect(row.deletedAt).not.toBeNull();
      expect(row.deletedById).toBe(admin.id);
      expect(
        (await db.owner.findUniqueOrThrow({ where: { id: owner.id } })).status,
      ).toBe('INTERESTED');
      const trash = await as(admin)
        .get('/trash?kind=LISTING&limit=20')
        .expect(200);
      expect(trash.body.data.map((t: { id: string }) => t.id)).toContain(id);
      await as(admin).delete(`/listings/${id}`).expect(404);
    });

    it('Member deletes a listing → 403 (role)', async () => {
      const id = await seedListing({ assignedToId: memberA.id });
      const res = await as(memberA).delete(`/listings/${id}`).expect(403);
      expect(res.body.error).toBe('FORBIDDEN');
      expect(
        (await db.listing.findUniqueOrThrow({ where: { id } })).deletedAt,
      ).toBeNull();
    });

    it('Delete listing or photo writes an activity entry (business: activity log)', async () => {
      const id = await seedListing({
        assignedToId: memberA.id,
        type: 'VILLA',
        bedrooms: 4,
      });
      const photo = await as(memberA)
        .post(`/listings/${id}/photos`, photoBody(id))
        .expect(201);
      await as(memberA)
        .delete(`/listings/${id}/photos/${photo.body.data.id}`)
        .expect(200);
      await as(admin).delete(`/listings/${id}`).expect(200);
      const entries = await db.activityEntry.findMany({
        where: { type: 'DELETE', targetId: { in: [id, photo.body.data.id] } },
      });
      expect(entries.map((e) => [e.targetKind, e.actorId]).sort()).toEqual([
        ['LISTING', admin.id],
        ['PHOTO', memberA.id],
      ]);
      expect(entries.find((e) => e.targetKind === 'LISTING')?.targetLabel).toBe(
        `Villa · 4 BR · ${AREA}`,
      );
    });

    it('Delete listing closes its open check-in and take-down reminders (business)', async () => {
      const id = await seedListing({ assignedToId: memberA.id });
      await goLive(memberA, id).expect(200);
      await db.reminder.create({
        data: {
          kind: 'AD_TAKE_DOWN',
          listingId: id,
          memberId: memberA.id,
          dueAt: new Date(),
        },
      });
      await db.reminder.create({
        data: {
          kind: 'MANUAL',
          listingId: id,
          memberId: memberA.id,
          dueAt: new Date(Date.now() + DAY),
        },
      });
      expect(await reminders(id, undefined, true)).toHaveLength(3);
      await as(admin).delete(`/listings/${id}`).expect(200);
      expect(await reminders(id, undefined, true)).toEqual([]);
    });

    it('restore: the owner is Listed again; refused when the owner has another listing now (OWNER_ALREADY_LISTED)', async () => {
      const owner = await seedOwner({
        assignedToId: memberA.id,
        status: 'LISTED',
      });
      const id = await seedListing({
        assignedToId: memberA.id,
        ownerId: owner.id,
      });
      await goLive(memberA, id).expect(200);
      await as(admin).delete(`/listings/${id}`).expect(200);
      await as(admin).post(`/trash/LISTING/${id}/restore`).expect(200);
      expect(
        (await db.owner.findUniqueOrThrow({ where: { id: owner.id } })).status,
      ).toBe('LISTED');
      // A Live ad gets its check-in back.
      expect(await reminders(id, 'AD_CHECK_IN', true)).toHaveLength(1);

      await as(admin).delete(`/listings/${id}`).expect(200);
      const { ownerName: _n, ownerPhone: _p, ...fields } = directBody();
      await as(memberA)
        .post('/listings', { ownerId: owner.id, ...fields })
        .expect(201);
      const res = await as(admin)
        .post(`/trash/LISTING/${id}/restore`)
        .expect(409);
      expect(res.body.error).toBe('OWNER_ALREADY_LISTED');
    });

    it('restore: a photo of a trashed listing → 409 PARENT_DELETED; a full listing → 409 TOO_MANY_PHOTOS', async () => {
      const id = await seedListing({ assignedToId: memberA.id });
      const photo = await as(memberA)
        .post(`/listings/${id}/photos`, photoBody(id))
        .expect(201);
      await as(memberA)
        .delete(`/listings/${id}/photos/${photo.body.data.id}`)
        .expect(200);
      await as(admin).delete(`/listings/${id}`).expect(200);
      const parent = await as(admin)
        .post(`/trash/PHOTO/${photo.body.data.id}/restore`)
        .expect(409);
      expect(parent.body.error).toBe('PARENT_DELETED');

      await as(admin).post(`/trash/LISTING/${id}/restore`).expect(200);
      await db.photo.createMany({
        data: Array.from({ length: 30 }, (_, order) => ({
          listingId: id,
          url: `https://${STORE_HOST}/listings/${id}/${order}.jpg`,
          pathname: `listings/${id}/${order}.jpg`,
          order,
        })),
      });
      const full = await as(admin)
        .post(`/trash/PHOTO/${photo.body.data.id}/restore`)
        .expect(409);
      expect(full.body.error).toBe('TOO_MANY_PHOTOS');
      await db.photo.deleteMany({
        where: { listingId: id, order: { gte: 29 }, deletedAt: null },
      });
      await as(admin)
        .post(`/trash/PHOTO/${photo.body.data.id}/restore`)
        .expect(200);
      const restored = await db.photo.findUniqueOrThrow({
        where: { id: photo.body.data.id },
      });
      expect(restored).toMatchObject({ deletedAt: null, order: 29 });
    });
  });

  // ================================================================ photos and uploads

  describe('photos and uploads', () => {
    it('Photo registration with a URL not on our Blob store → 400 (checklist: input trust)', async () => {
      const id = await seedListing({ assignedToId: memberA.id });
      const other = await seedListing({ assignedToId: memberA.id });
      const good = photoBody(id);
      const cases = [
        {
          url: `https://evil.example.com/${good.pathname}`,
          pathname: good.pathname,
        },
        {
          url: good.url.replace(STORE_HOST, `x.${STORE_HOST}`),
          pathname: good.pathname,
        },
        {
          url: good.url.replace('https://', 'https://user:pw@'),
          pathname: good.pathname,
        },
        {
          url: good.url.replace(STORE_HOST, `${STORE_HOST}:8443`),
          pathname: good.pathname,
        },
        { url: good.url, pathname: `${good.pathname}x` },
        photoBody(other), // another listing's folder
        {
          url: `https://${STORE_HOST}/elsewhere/a.jpg`,
          pathname: 'elsewhere/a.jpg',
        },
        {
          url: `https://${STORE_HOST}/listings/${id}/a/b.jpg`,
          pathname: `listings/${id}/a/b.jpg`,
        },
      ];
      for (const body of cases) {
        const res = await as(memberA)
          .post(`/listings/${id}/photos`, body)
          .expect(400);
        expect(res.body.error).toBe('PHOTO_URL_INVALID');
      }
      await as(memberA)
        .post(`/listings/${id}/photos`, {
          ...good,
          url: good.url.replace('https', 'http'),
        })
        .expect(400);
      expect(await db.photo.count({ where: { listingId: id } })).toBe(0);

      const ok = await as(memberA)
        .post(`/listings/${id}/photos`, good)
        .expect(201);
      expect(ok.body.data).toEqual({
        id: expect.any(String),
        url: good.url,
        order: 0,
      });
      // The same file again returns the same photo.
      const again = await as(memberA)
        .post(`/listings/${id}/photos`, good)
        .expect(201);
      expect(again.body.data.id).toBe(ok.body.data.id);
      const listing = await as(memberB).get(`/listings/${id}`).expect(200);
      expect(listing.body.data.photos).toEqual([ok.body.data]);
      expect(listing.body.data.coverPhotoUrl).toBe(good.url);
    });

    it('31st photo → 409 TOO_MANY_PHOTOS (contract)', async () => {
      const id = await seedListing({ assignedToId: memberA.id });
      await db.photo.createMany({
        data: Array.from({ length: 29 }, (_, order) => ({
          listingId: id,
          url: `https://${STORE_HOST}/listings/${id}/${order}.jpg`,
          pathname: `listings/${id}/${order}.jpg`,
          order,
        })),
      });
      const thirtieth = await as(memberA)
        .post(`/listings/${id}/photos`, photoBody(id))
        .expect(201);
      expect(thirtieth.body.data.order).toBe(29);
      const res = await as(memberA)
        .post(`/listings/${id}/photos`, photoBody(id))
        .expect(409);
      expect(res.body.error).toBe('TOO_MANY_PHOTOS');
      expect(
        await db.photo.count({ where: { listingId: id, deletedAt: null } }),
      ).toBe(30);
    });

    it('two photo registrations at once never pass 30 (concurrency)', async () => {
      const id = await seedListing({ assignedToId: memberA.id });
      await db.photo.createMany({
        data: Array.from({ length: 29 }, (_, order) => ({
          listingId: id,
          url: `https://${STORE_HOST}/listings/${id}/${order}.jpg`,
          pathname: `listings/${id}/${order}.jpg`,
          order,
        })),
      });
      const results = await Promise.all([
        as(memberA).post(`/listings/${id}/photos`, photoBody(id)),
        as(admin).post(`/listings/${id}/photos`, photoBody(id)),
      ]);
      expect(results.map((r) => r.status).sort()).toEqual([201, 409]);
      expect(
        await db.photo.count({ where: { listingId: id, deletedAt: null } }),
      ).toBe(30);
    });

    it('Reorder with a missing or foreign photo id → 400 (contract)', async () => {
      const id = await seedListing({ assignedToId: memberA.id });
      const other = await seedListing({ assignedToId: memberA.id });
      const p = [];
      for (let i = 0; i < 3; i++) {
        p.push(
          (
            await as(memberA)
              .post(`/listings/${id}/photos`, photoBody(id))
              .expect(201)
          ).body.data.id,
        );
      }
      const foreign = (
        await as(memberA)
          .post(`/listings/${other}/photos`, photoBody(other))
          .expect(201)
      ).body.data.id;
      for (const photoIds of [
        [p[0], p[1]],
        [p[0], p[1], foreign],
        [p[0], p[1], p[2], foreign],
      ]) {
        const res = await as(memberA)
          .put(`/listings/${id}/photos/order`, { photoIds })
          .expect(400);
        expect(res.body.error).toBe('PHOTO_SET_MISMATCH');
      }
      await as(memberA)
        .put(`/listings/${id}/photos/order`, { photoIds: [p[0], p[0], p[1]] })
        .expect(400);
      const ok = await as(memberA)
        .put(`/listings/${id}/photos/order`, { photoIds: [p[2], p[0], p[1]] })
        .expect(200);
      expect(
        ok.body.data.map((x: { id: string; order: number }) => [x.id, x.order]),
      ).toEqual([
        [p[2], 0],
        [p[0], 1],
        [p[1], 2],
      ]);
      const row = (
        await search(memberA, '&limit=20').expect(200)
      ).body.data.find((r: { id: string }) => r.id === id);
      expect(row.coverPhotoUrl).toBe(ok.body.data[0].url);
    });

    it('Photo delete by a non-assigned member → 403 (role)', async () => {
      const id = await seedListing({ assignedToId: memberA.id });
      const photo = await as(memberA)
        .post(`/listings/${id}/photos`, photoBody(id))
        .expect(201);
      const res = await as(memberB)
        .delete(`/listings/${id}/photos/${photo.body.data.id}`)
        .expect(403);
      expect(res.body.error).toBe('FORBIDDEN');
      await as(memberB)
        .post(`/listings/${id}/photos`, photoBody(id))
        .expect(403);
      await as(memberB)
        .put(`/listings/${id}/photos/order`, { photoIds: [photo.body.data.id] })
        .expect(403);
      // A photo id of another listing is a 404.
      const other = await seedListing({ assignedToId: memberA.id });
      await as(memberA)
        .delete(`/listings/${other}/photos/${photo.body.data.id}`)
        .expect(404);
      await as(admin)
        .delete(`/listings/${id}/photos/${photo.body.data.id}`)
        .expect(200);
      await as(admin)
        .delete(`/listings/${id}/photos/${photo.body.data.id}`)
        .expect(404);
    });

    it("Upload token for a listing the member isn't assigned → 403 (role)", async () => {
      const id = await seedListing({ assignedToId: memberB.id });
      const event = (
        listingId: string,
        pathname = `listings/${listingId}/a.jpg`,
      ) => ({
        type: 'blob.generate-client-token',
        payload: {
          pathname,
          clientPayload: JSON.stringify({ listingId }),
          multipart: false,
        },
      });
      const res = await as(memberA)
        .post('/uploads/listing-photo', event(id))
        .expect(403);
      expect(res.body.error).toBe('FORBIDDEN');

      // The member gets a raw (not enveloped) Blob token for the listing's folder only.
      const ok = await as(memberB)
        .post('/uploads/listing-photo', event(id))
        .expect(200);
      expect(ok.body).toEqual({
        type: 'blob.generate-client-token',
        clientToken: expect.stringMatching(/^vercel_blob_client_t8teststore_/),
      });
      const payload = getPayloadFromClientToken(ok.body.clientToken);
      expect(payload).toMatchObject({
        pathname: `listings/${id}/a.jpg`,
        allowedContentTypes: ['image/jpeg', 'image/png', 'image/webp'],
        maximumSizeInBytes: 10 * 1024 * 1024,
        addRandomSuffix: true,
      });
      expect(payload.validUntil).toBeGreaterThan(Date.now());

      for (const [body, status] of [
        [event(id, `listings/${randomUUID()}/a.jpg`), 400],
        [event(id, `listings/${id}/../x.jpg`), 400],
        [event(id, `listings/${id}/`), 400],
        [
          {
            ...event(id),
            payload: { ...event(id).payload, clientPayload: 'nope' },
          },
          400,
        ],
        [{ ...event(id), payload: { pathname: `listings/${id}/a.jpg` } }, 400],
        [event(randomUUID()), 404],
        [{ type: 'blob.upload-completed', payload: { blob: {} } }, 400],
        [{ ...event(id), extra: 1 }, 400],
      ] as const) {
        await as(memberB).post('/uploads/listing-photo', body).expect(status);
      }
      await http()
        .post('/api/uploads/listing-photo')
        .send(event(id))
        .expect(401);
      await as(admin).post('/uploads/listing-photo', event(id)).expect(200);
    });
  });

  // ================================================================ notes

  describe('notes', () => {
    it('anyone reads notes; the member and manageAll add them; Arabic and emoji kept', async () => {
      const id = await seedListing({ assignedToId: memberA.id });
      const res = await as(memberA)
        .post(`/listings/${id}/notes`, {
          body: '  العميل يريد الدور الأرضي 🏡  ',
        })
        .expect(201);
      expect(res.body.data).toMatchObject({
        body: 'العميل يريد الدور الأرضي 🏡',
        author: { id: memberA.id },
      });
      await as(admin)
        .post(`/listings/${id}/notes`, { body: 'admin' })
        .expect(201);
      const list = await as(memberB)
        .get(`/listings/${id}/notes?limit=1`)
        .expect(200);
      expect(list.body.meta).toMatchObject({ total: 2, hasNextPage: true });
      expect(list.body.data[0].body).toBe('admin');
      await as(memberA)
        .post(`/listings/${id}/notes`, { body: '   ' })
        .expect(400);
      await as(memberA)
        .post(`/listings/${id}/notes`, { body: 'x'.repeat(2001) })
        .expect(400);
      const detail = await as(memberB).get(`/listings/${id}`).expect(200);
      expect(detail.body.data.notes).toHaveLength(2);
    });
  });

  // ================================================================ generic checklist

  describe('generic checklist', () => {
    it('no token, an expired token → 401 on every listing route', async () => {
      const id = randomUUID();
      const routes: [string, string][] = [
        ['get', '/api/listings'],
        ['post', '/api/listings'],
        ['post', '/api/listings/assign'],
        ['get', `/api/listings/${id}`],
        ['patch', `/api/listings/${id}`],
        ['delete', `/api/listings/${id}`],
        ['post', `/api/listings/${id}/status`],
        ['put', `/api/listings/${id}/ad`],
        ['post', `/api/listings/${id}/ad/check-in`],
        ['get', `/api/listings/${id}/notes`],
        ['post', `/api/listings/${id}/notes`],
        ['post', `/api/listings/${id}/photos`],
        ['put', `/api/listings/${id}/photos/order`],
        ['delete', `/api/listings/${id}/photos/${id}`],
        ['post', '/api/uploads/listing-photo'],
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

    it('validation: missing, extra, wrong-type and null fields → 400', async () => {
      const id = await seedListing({ assignedToId: memberA.id });
      for (const body of [
        {},
        directBody({ purpose: 'LEASE' }),
        directBody({ type: 'CASTLE' }),
        directBody({ price: '100' }),
        directBody({ sizeSqm: null }),
        directBody({ compound: null }),
        directBody({ area: '   ' }),
        directBody({ bedrooms: -1 }),
        directBody({ floor: -11 }),
        directBody({ ownerPhone: '12345' }),
        directBody({ status: 'SOLD' }),
        directBody({ createdById: admin.id }),
        directBody({ description: 'x'.repeat(5001) }),
      ]) {
        const res = await as(admin).post('/listings', body).expect(400);
        expect(res.body).toMatchObject({
          success: false,
          error: 'VALIDATION_FAILED',
        });
      }
      for (const body of [
        { status: 'GONE' },
        {},
        { status: 'SOLD', extra: 1 },
      ]) {
        await as(memberA).post(`/listings/${id}/status`, body).expect(400);
      }
      for (const body of [
        { status: 'LIVE', link: 'ftp://x.com' },
        { status: 'LIVE', postedAt: '2026-10-22' },
        {},
      ]) {
        await as(memberA).put(`/listings/${id}/ad`, body).expect(400);
      }
      await as(memberA)
        .post(`/listings/${id}/ad/check-in`, { stillAvailable: 'yes' })
        .expect(400);
      await as(memberA).patch(`/listings/${id}`, { price: null }).expect(400);
      await as(memberA).get('/listings/not-a-uuid').expect(400);
      for (const q of [
        '&type=CASTLE',
        '&status=GONE',
        '&sort=cheap',
        '&checkInDue=yes',
        '&assignedTo=bob',
        '&priceMin=-1',
        '&floorMin=1.5',
        '&unknown=1',
      ]) {
        await search(memberA, q).expect(400);
      }
    });

    it('pagination: page 0, limit 0/21/x → 400; past the end → empty; limit 1 → hasNextPage', async () => {
      await seedListing();
      await seedListing();
      for (const q of [
        '&page=0',
        '&limit=0',
        '&limit=21',
        '&limit=x',
        '&page=1.5',
      ]) {
        await search(memberA, q).expect(400);
      }
      const past = await search(memberA, '&page=999').expect(200);
      expect(past.body.data).toEqual([]);
      const one = await search(memberA, '&limit=1').expect(200);
      expect(one.body.data).toHaveLength(1);
      expect(one.body.meta).toMatchObject({
        limit: 1,
        page: 1,
        hasNextPage: true,
        hasPreviousPage: false,
      });
      const none = await as(memberA)
        .get(`/listings?area=${run}-nowhere`)
        .expect(200);
      expect(none.body).toMatchObject({ data: [], meta: { total: 0 } });
    });

    it('search text with `%`, `_` and quotes matches literally; Arabic text searches and shows the Arabic title', async () => {
      const pct = await seedListing({ compound: '100% Garden_View' });
      const plain = await seedListing({ compound: '100 Gardenx View' });
      const quoted = await seedListing({ description: `O'Brien "quoted"` });
      const ids = async (q: string) =>
        (
          await search(memberA, `&q=${encodeURIComponent(q)}`).expect(200)
        ).body.data.map((r: { id: string }) => r.id);
      expect(await ids('100%')).toEqual([pct]);
      expect(await ids('Garden_View')).toEqual([pct]);
      expect(await ids('%')).toEqual([pct]);
      expect(await ids(`O'Brien "quoted"`)).toEqual([quoted]);
      expect(await ids('Gardenx')).toEqual([plain]);

      const arabic = await seedListing({
        type: 'VILLA',
        bedrooms: 4,
        description: 'فيلا بحديقة 🌳',
        ownerName: 'سارة محمود',
      });
      expect(await ids('بحديقة')).toEqual([arabic]);
      expect(await ids('سارة')).toEqual([arabic]);
      await db.user.update({
        where: { id: memberB.id },
        data: { language: 'ar' },
      });
      try {
        const res = await as(memberB).get(`/listings/${arabic}`).expect(200);
        expect(res.body.data.title).toBe(`فيلا · 4 غرف · ${AREA}`);
      } finally {
        await db.user.update({
          where: { id: memberB.id },
          data: { language: 'en' },
        });
      }
    });

    it('a deleted listing answers 404 on every listing route', async () => {
      const id = await seedListing({
        assignedToId: memberA.id,
        deletedAt: new Date(),
        deletedById: admin.id,
      });
      const photoId = randomUUID();
      for (const call of [
        () => as(memberA).get(`/listings/${id}`),
        () => as(memberA).patch(`/listings/${id}`, { price: 5 }),
        () => as(memberA).post(`/listings/${id}/status`, { status: 'SOLD' }),
        () => as(memberA).put(`/listings/${id}/ad`, { status: 'TAKEN_DOWN' }),
        () =>
          as(memberA).post(`/listings/${id}/ad/check-in`, {
            stillAvailable: true,
          }),
        () => as(memberA).get(`/listings/${id}/notes`),
        () => as(memberA).post(`/listings/${id}/notes`, { body: 'x' }),
        () => as(memberA).post(`/listings/${id}/photos`, photoBody(id)),
        () =>
          as(memberA).put(`/listings/${id}/photos/order`, {
            photoIds: [photoId],
          }),
        () => as(memberA).delete(`/listings/${id}/photos/${photoId}`),
        () => as(admin).delete(`/listings/${id}`),
        () =>
          as(memberA).post('/uploads/listing-photo', {
            type: 'blob.generate-client-token',
            payload: {
              pathname: `listings/${id}/a.jpg`,
              clientPayload: JSON.stringify({ listingId: id }),
              multipart: false,
            },
          }),
      ]) {
        const res = await call().expect(404);
        expect(res.body.error).toBe('NOT_FOUND');
      }
      // Assigning a deleted id moves nothing.
      const res = await as(admin)
        .post('/listings/assign', { listingIds: [id], assigneeId: memberB.id })
        .expect(200);
      expect(res.body.data).toEqual({ moved: 0 });
      await as(memberA).get(`/listings/${randomUUID()}`).expect(404);
    });
  });
});
