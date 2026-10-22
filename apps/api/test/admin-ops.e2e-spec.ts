import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import type { Prisma, PrismaClient } from '@prisma/client';
import { PERMISSION_KEYS } from '@prime-crm/shared';
import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { configureApp } from '../src/app.setup';
import { Clock } from '../src/common/providers/clock';
import { hashPassword } from '../src/common/utils/password.util';
import { SessionService } from '../src/domains/auth/session.service';
import { BlobConfig } from '../src/domains/uploads/blob.config';
import {
  createTestDb,
  randomLocalMobile,
  randomPassword,
  uniqueEmail,
} from './helpers';
import {
  bearer,
  createUserWithToken,
  ensureBuiltInRoles,
  signExpiredToken,
} from './helpers-auth';

/**
 * T10 — admin ops: deactivate with hand-over, reactivate, settings, and the restore rules the
 * OWNER / LISTING / PHOTO handlers (T6, T8) add to `POST /trash/:kind/:id/restore`. Every case of
 * the plan's T10 section is an `it` named after it, except the four T3 already covers in
 * `common-core.e2e-spec.ts` (trash list < 30 days, the 30-day boundary, member restore → 403,
 * restore of an item not in the trash → 404). Then the generic checklist.
 */

type Actor = Awaited<ReturnType<typeof createUserWithToken>>;

const e164 = (local: string) => `+20${local.slice(1)}`;
const DAY = 24 * 60 * 60 * 1000;
const STORE_HOST = 't10teststore.private.blob.vercel-storage.com';
const FAKE_BLOB_TOKEN = `vercel_blob_rw_t10teststore_${randomUUID().replace(/-/g, '')}`;

describe('Admin ops: deactivate, reactivate, settings, restore (e2e)', () => {
  let app: INestApplication;
  let db: PrismaClient;
  let frozen: Date | null = null;
  const http = () => request(app.getHttpServer());
  const run = `T10-${Date.now()}`;

  let adminRoleId: string;
  let memberRoleId: string;
  let admin: Actor;
  let manager: Actor; // custom role: users.manage only
  let memberA: Actor;
  let memberB: Actor;
  let plain: Actor; // Team member, no permissions
  const users: string[] = [];
  const roles: string[] = [];
  let settingBefore = 7;

  // ---------------------------------------------------------------- fixtures

  async function newUser(
    label: string,
    roleId = memberRoleId,
    permissions: string[] = [],
  ): Promise<Actor> {
    const user = await createUserWithToken(db, label, roleId, permissions);
    users.push(user.id);
    return user;
  }

  /** A user who can really sign in (a hashed random password). */
  async function signInUser(label: string) {
    const password = randomPassword();
    const email = uniqueEmail(label);
    const user = await db.user.create({
      data: {
        name: `E2E ${label}`,
        email,
        passwordHash: await hashPassword(password),
        roleId: memberRoleId,
      },
    });
    users.push(user.id);
    return { id: user.id, email, password };
  }

  const login = (email: string, password: string) =>
    http().post('/api/auth/login').send({ email, password });

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
        area: `${run} Zayed`,
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

  const seedReminder = (
    fields: Partial<Prisma.ReminderUncheckedCreateInput>,
  ) =>
    db.reminder.create({
      data: {
        dueAt: new Date(Date.now() + DAY),
        createdById: admin.id,
        ...fields,
      },
    });

  async function seedPhoto(listingId: string, order = 0) {
    const pathname = `listings/${listingId}/${randomUUID()}.jpg`;
    return db.photo.create({
      data: {
        listingId,
        url: `https://${STORE_HOST}/${pathname}`,
        pathname,
        order,
      },
    });
  }

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

  const deactivate = (
    actor: Actor,
    id: string,
    handOverTo: string | null,
  ) => as(actor).post(`/users/${id}/deactivate`, { handOverTo });

  const lastEntry = (type: string, targetId?: string) =>
    db.activityEntry.findFirst({
      where: { type: type as never, ...(targetId && { targetId }) },
      orderBy: { createdAt: 'desc' },
    });

  /** Makes `keep` the only active admins while `work` runs (others restored after). */
  async function onlyAdmins(keep: string[], work: () => Promise<void>) {
    const others = await db.user.findMany({
      where: { roleId: adminRoleId, active: true, id: { notIn: keep } },
      select: { id: true },
    });
    const ids = others.map((u) => u.id);
    await db.user.updateMany({
      where: { id: { in: ids } },
      data: { active: false },
    });
    try {
      await work();
    } finally {
      await db.user.updateMany({
        where: { id: { in: ids } },
        data: { active: true },
      });
    }
  }

  // ---------------------------------------------------------------- lifecycle

  beforeAll(async () => {
    db = createTestDb();
    ({ adminRoleId, memberRoleId } = await ensureBuiltInRoles(db));
    admin = await newUser('t10-admin', adminRoleId, []);
    memberA = await newUser('t10-a');
    memberB = await newUser('t10-b');
    plain = await newUser('t10-plain');
    const managerRole = await db.role.create({
      data: { name: `${run} manager`, permissions: ['users.manage'] },
    });
    roles.push(managerRole.id);
    manager = await newUser('t10-manager', managerRole.id, ['users.manage']);

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
    await db.setting.update({
      where: { id: 1 },
      data: { adCheckInDays: 7, updatedById: null },
    });
  });

  afterAll(async () => {
    if (db) {
      const where = { in: users };
      await db.setting.update({
        where: { id: 1 },
        data: { adCheckInDays: settingBefore, updatedById: null },
      });
      await db.activityEntry.deleteMany({ where: { actorId: where } });
      await db.call.deleteMany({ where: { memberId: where } });
      await db.reminder.deleteMany({
        where: { OR: [{ memberId: where }, { createdById: where }] },
      });
      await db.note.deleteMany({ where: { authorId: where } });
      await db.ownerAssignment.deleteMany({
        where: {
          OR: [{ byId: where }, { fromMemberId: where }, { toMemberId: where }],
        },
      });
      await db.photo.deleteMany({ where: { listing: { createdById: where } } });
      await db.listing.deleteMany({ where: { createdById: where } });
      await db.owner.deleteMany({ where: { createdById: where } });
      await db.user.deleteMany({ where: { id: where } });
      await db.role.deleteMany({ where: { id: { in: roles } } });
      await db.$disconnect();
    }
    await app?.close();
  });

  // ================================================================ deactivate

  describe('deactivate and reactivate', () => {
    it('Deactivate with handOverTo member → their owners, listings and open reminders move in one transaction; calls and done reminders stay theirs (flow 8)', async () => {
      const victim = await newUser('t10-victim');
      const owner = await seedOwner({
        assignedToId: victim.id,
        status: 'LISTED',
      });
      const linked = await seedListing({
        assignedToId: victim.id,
        ownerId: owner.id,
      });
      const direct = await seedListing({ assignedToId: victim.id });
      const plainOwner = await seedOwner({ assignedToId: victim.id });
      const trashed = await seedOwner({
        assignedToId: victim.id,
        deletedAt: new Date(),
        deletedById: admin.id,
      });
      const open1 = await seedReminder({
        ownerId: owner.id,
        memberId: victim.id,
      });
      const open2 = await seedReminder({
        listingId: direct,
        memberId: victim.id,
        kind: 'AD_CHECK_IN',
      });
      const open3 = await seedReminder({
        ownerId: plainOwner.id,
        memberId: victim.id,
      });
      const done = await seedReminder({
        ownerId: owner.id,
        memberId: victim.id,
        doneAt: new Date(),
      });
      const call = await db.call.create({
        data: {
          ownerId: owner.id,
          ownerName: 'x',
          memberId: victim.id,
          phone: e164(owner.phones[0]),
          clientRequestId: randomUUID(),
        },
      });

      const res = await deactivate(admin, victim.id, memberB.id).expect(200);
      expect(res.body.data).toMatchObject({ id: victim.id, active: false });

      const assigned = async () => [
        ...(await db.owner.findMany({
          where: { id: { in: [owner.id, plainOwner.id] } },
          select: { assignedToId: true },
        })),
        ...(await db.listing.findMany({
          where: { id: { in: [linked, direct] } },
          select: { assignedToId: true },
        })),
      ];
      expect((await assigned()).map((r) => r.assignedToId)).toEqual([
        memberB.id,
        memberB.id,
        memberB.id,
        memberB.id,
      ]);
      for (const r of [open1, open2, open3]) {
        expect(
          (await db.reminder.findUniqueOrThrow({ where: { id: r.id } }))
            .memberId,
        ).toBe(memberB.id);
      }
      expect(
        (await db.reminder.findUniqueOrThrow({ where: { id: done.id } }))
          .memberId,
      ).toBe(victim.id);
      expect(
        (await db.call.findUniqueOrThrow({ where: { id: call.id } })).memberId,
      ).toBe(victim.id);
      // A trashed owner is left alone (its restore brings it back unassigned, T6).
      expect(
        (await db.owner.findUniqueOrThrow({ where: { id: trashed.id } }))
          .assignedToId,
      ).toBe(victim.id);
      // Each owner whose member changed gets its assignment history row.
      expect(
        await db.ownerAssignment.count({
          where: { fromMemberId: victim.id, toMemberId: memberB.id },
        }),
      ).toBe(2);

      const entry = await lastEntry('USER_DEACTIVATE', victim.id);
      expect(entry).toMatchObject({ actorId: admin.id });
      expect(entry?.details).toMatchObject({
        handOverTo: { id: memberB.id, name: memberB.name },
        owners: 2,
        listings: 2,
        reminders: 3,
      });
      const row = await db.user.findUniqueOrThrow({
        where: { id: victim.id },
      });
      expect(row.deactivatedAt).not.toBeNull();
    });

    it('Deactivate with handOverTo null → owners, listings and their open reminders become unassigned; the reminders follow the owner/listing on its next assignment (flow 8; decision logged)', async () => {
      const victim = await newUser('t10-victim-null');
      const owner = await seedOwner({
        assignedToId: victim.id,
        status: 'LISTED',
      });
      const listing = await seedListing({
        assignedToId: victim.id,
        ownerId: owner.id,
      });
      const r1 = await seedReminder({ ownerId: owner.id, memberId: victim.id });
      const r2 = await seedReminder({ listingId: listing, memberId: victim.id });

      await deactivate(admin, victim.id, null).expect(200);
      expect(
        (await db.owner.findUniqueOrThrow({ where: { id: owner.id } }))
          .assignedToId,
      ).toBeNull();
      expect(
        (await db.listing.findUniqueOrThrow({ where: { id: listing } }))
          .assignedToId,
      ).toBeNull();
      const memberOf = async (id: string) =>
        (await db.reminder.findUniqueOrThrow({ where: { id } })).memberId;
      expect([await memberOf(r1.id), await memberOf(r2.id)]).toEqual([
        null,
        null,
      ]);
      const entry = await lastEntry('USER_DEACTIVATE', victim.id);
      expect(entry?.details).toMatchObject({
        handOverTo: null,
        owners: 1,
        listings: 1,
        reminders: 2,
      });

      // The admin sees them as unassigned reminders, then they follow the next assignment.
      const unassigned = await as(admin)
        .get('/reminders?unassigned=true&limit=20&page=1')
        .expect(200);
      expect(unassigned.body.meta.total).toBeGreaterThanOrEqual(2);
      await as(admin)
        .post('/owners/assign', { ownerIds: [owner.id], assigneeId: memberA.id })
        .expect(200);
      expect([await memberOf(r1.id), await memberOf(r2.id)]).toEqual([
        memberA.id,
        memberA.id,
      ]);
      expect(
        (await db.listing.findUniqueOrThrow({ where: { id: listing } }))
          .assignedToId,
      ).toBe(memberA.id);
    });

    it('handOverTo an inactive user or the same user → 400 INVALID_HANDOVER (contract)', async () => {
      const victim = await newUser('t10-victim-bad');
      const owner = await seedOwner({ assignedToId: victim.id });
      const gone = await newUser('t10-gone');
      await db.user.update({ where: { id: gone.id }, data: { active: false } });

      for (const handOverTo of [gone.id, victim.id, randomUUID()]) {
        const res = await deactivate(admin, victim.id, handOverTo).expect(400);
        expect(res.body).toMatchObject({
          success: false,
          error: 'INVALID_HANDOVER',
        });
      }
      expect(
        await db.user.findUniqueOrThrow({ where: { id: victim.id } }),
      ).toMatchObject({ active: true });
      expect(
        (await db.owner.findUniqueOrThrow({ where: { id: owner.id } }))
          .assignedToId,
      ).toBe(victim.id);
    });

    it('Deactivate the last active admin → 409 LAST_ADMIN; deactivate self → 400 (invariant)', async () => {
      const solo = await newUser('t10-solo', adminRoleId, [...PERMISSION_KEYS]);
      await onlyAdmins([solo.id], async () => {
        const res = await deactivate(manager, solo.id, null).expect(409);
        expect(res.body).toMatchObject({ success: false, error: 'LAST_ADMIN' });
        expect(
          (await db.user.findUniqueOrThrow({ where: { id: solo.id } })).active,
        ).toBe(true);
      });

      const self = await deactivate(manager, manager.id, null).expect(400);
      expect(self.body.error).toBe('SELF_DEACTIVATE');
      const selfAdmin = await deactivate(solo, solo.id, memberA.id).expect(400);
      expect(selfAdmin.body.error).toBe('SELF_DEACTIVATE');
    });

    it("Deactivated user's sessions revoked (invariant: can't sign in)", async () => {
      const user = await signInUser('t10-session');
      const signedIn = await login(user.email, user.password).expect(200);
      const { accessToken, refreshToken } = signedIn.body.data;
      await http()
        .get('/api/auth/me')
        .set(bearer(accessToken))
        .expect(200);

      await deactivate(admin, user.id, null).expect(200);

      const tokens = await db.refreshToken.findMany({
        where: { userId: user.id },
      });
      expect(tokens.length).toBeGreaterThan(0);
      expect(tokens.every((t) => t.revokedAt !== null)).toBe(true);
      await http()
        .post('/api/auth/refresh')
        .send({ refreshToken })
        .expect(401);
      await http().get('/api/auth/me').set(bearer(accessToken)).expect(401);
      const again = await login(user.email, user.password).expect(401);
      expect(again.body.error).toBe('INVALID_CREDENTIALS');
      expect(
        (await lastEntry('USER_DEACTIVATE', user.id))?.details,
      ).toMatchObject({ sessionsEnded: 1 });
    });

    it('Reactivate → can sign in again, gets nothing back automatically (decision)', async () => {
      const user = await signInUser('t10-back');
      const owner = await seedOwner({ assignedToId: user.id });
      await deactivate(admin, user.id, memberB.id).expect(200);
      await login(user.email, user.password).expect(401);

      const res = await as(admin).post(`/users/${user.id}/reactivate`).expect(200);
      expect(res.body.data).toMatchObject({ id: user.id, active: true });
      await login(user.email, user.password).expect(200);

      const detail = await as(admin).get(`/users/${user.id}`).expect(200);
      expect(detail.body.data.counts).toEqual({
        owners: 0,
        listings: 0,
        openReminders: 0,
      });
      expect(
        (await db.owner.findUniqueOrThrow({ where: { id: owner.id } }))
          .assignedToId,
      ).toBe(memberB.id);
      expect(
        (await db.user.findUniqueOrThrow({ where: { id: user.id } }))
          .deactivatedAt,
      ).toBeNull();
    });

    it('Deactivation failing midway → nothing moved, user still active (checklist: half-applied)', async () => {
      const victim = await newUser('t10-midway');
      const owner = await seedOwner({ assignedToId: victim.id });
      const listing = await seedListing({ assignedToId: victim.id });
      const reminder = await seedReminder({
        ownerId: owner.id,
        memberId: victim.id,
      });
      const sessions = app.get(SessionService);
      const spy = jest
        .spyOn(sessions, 'revokeAllSessions')
        .mockRejectedValueOnce(new Error('simulated failure'));
      try {
        await deactivate(admin, victim.id, memberB.id).expect(500);
      } finally {
        spy.mockRestore();
      }

      expect(
        (await db.user.findUniqueOrThrow({ where: { id: victim.id } })).active,
      ).toBe(true);
      expect(
        (await db.owner.findUniqueOrThrow({ where: { id: owner.id } }))
          .assignedToId,
      ).toBe(victim.id);
      expect(
        (await db.listing.findUniqueOrThrow({ where: { id: listing } }))
          .assignedToId,
      ).toBe(victim.id);
      expect(
        (await db.reminder.findUniqueOrThrow({ where: { id: reminder.id } }))
          .memberId,
      ).toBe(victim.id);
      expect(
        await db.ownerAssignment.count({ where: { ownerId: owner.id } }),
      ).toBe(0);
      expect(await lastEntry('USER_DEACTIVATE', victim.id)).toBeNull();
    });

    it('Two admins deactivate each other concurrently → one admin remains active (invariant)', async () => {
      for (let round = 0; round < 3; round++) {
        const a = await newUser(`t10-race-a${round}`, adminRoleId, [
          ...PERMISSION_KEYS,
        ]);
        const b = await newUser(`t10-race-b${round}`, adminRoleId, [
          ...PERMISSION_KEYS,
        ]);
        await onlyAdmins([a.id, b.id], async () => {
          const [ab, ba] = await Promise.all([
            deactivate(a, b.id, null),
            deactivate(b, a.id, null),
          ]);
          const statuses = [ab.status, ba.status].sort();
          // The loser either reaches the transaction (409) or is already locked out (401).
          expect(statuses[0]).toBe(200);
          expect([401, 409]).toContain(statuses[1]);
          expect(
            await db.user.count({
              where: { roleId: adminRoleId, active: true },
            }),
          ).toBe(1);
        });
      }
    });
  });

  // ================================================================ restore (T6 / T8 handlers)

  describe('restore through /trash', () => {
    it('Restore an owner → it returns with its phones (never released) and its listing link (decision: trashed owners keep their phone)', async () => {
      const phones = [randomLocalMobile(), randomLocalMobile()];
      const owner = await seedOwner({
        assignedToId: memberA.id,
        status: 'INTERESTED',
        phones,
      });
      const listingId = await seedListing({
        ownerId: owner.id,
        deletedAt: new Date(),
        deletedById: admin.id,
      });
      await as(admin).delete(`/owners/${owner.id}`).expect(200);

      // While trashed, nobody else can take its phones.
      const taken = await as(admin)
        .post('/owners', { name: 'Someone else', phones: [phones[1]] })
        .expect(409);
      expect(taken.body.error).toBe('PHONE_IN_TRASH');

      await as(admin).post(`/trash/owner/${owner.id}/restore`).expect(200);
      const res = await as(memberA).get(`/owners/${owner.id}`).expect(200);
      expect(res.body.data).toMatchObject({
        phones: phones.map(e164),
        assignedTo: { id: memberA.id },
      });
      expect(
        (await db.listing.findUniqueOrThrow({ where: { id: listingId } }))
          .ownerId,
      ).toBe(owner.id);
    });

    it('Restore a photo whose listing is deleted → 409 PARENT_DELETED (restore the listing first) (decision logged)', async () => {
      const listing = await seedListing({ assignedToId: memberA.id });
      const photo = await seedPhoto(listing);
      await as(admin).delete(`/listings/${listing}/photos/${photo.id}`).expect(200);
      await as(admin).delete(`/listings/${listing}`).expect(200);

      const res = await as(admin)
        .post(`/trash/PHOTO/${photo.id}/restore`)
        .expect(409);
      expect(res.body.error).toBe('PARENT_DELETED');
      expect(
        (await db.photo.findUniqueOrThrow({ where: { id: photo.id } }))
          .deletedAt,
      ).not.toBeNull();

      await as(admin).post(`/trash/LISTING/${listing}/restore`).expect(200);
      await as(admin).post(`/trash/PHOTO/${photo.id}/restore`).expect(200);
    });

    it('Restore a listing whose owner lead has another listing now → 409 OWNER_ALREADY_LISTED; otherwise restore re-flags the owner LISTED (business: restore)', async () => {
      // Otherwise: the owner goes back to Listed.
      const owner = await seedOwner({
        assignedToId: memberA.id,
        status: 'LISTED',
      });
      const listing = await seedListing({
        assignedToId: memberA.id,
        ownerId: owner.id,
      });
      await as(admin).delete(`/listings/${listing}`).expect(200);
      expect(
        (await db.owner.findUniqueOrThrow({ where: { id: owner.id } })).status,
      ).toBe('INTERESTED');
      await as(admin).post(`/trash/LISTING/${listing}/restore`).expect(200);
      expect(
        (await db.owner.findUniqueOrThrow({ where: { id: owner.id } })).status,
      ).toBe('LISTED');

      // The owner gets another listing meanwhile → refused.
      await as(admin).delete(`/listings/${listing}`).expect(200);
      await as(memberA)
        .post('/listings', {
          ownerId: owner.id,
          purpose: 'RENT',
          type: 'VILLA',
          area: `${run} Zayed`,
          sizeSqm: 300,
          bedrooms: 4,
          price: 50_000,
        })
        .expect(201);
      const res = await as(admin)
        .post(`/trash/LISTING/${listing}/restore`)
        .expect(409);
      expect(res.body.error).toBe('OWNER_ALREADY_LISTED');
      expect(
        (await db.listing.findUniqueOrThrow({ where: { id: listing } }))
          .deletedAt,
      ).not.toBeNull();
    });

    it('Restore a photo when the listing already has 30 → 409 TOO_MANY_PHOTOS (contract)', async () => {
      const listing = await seedListing({ assignedToId: memberA.id });
      const extra = await seedPhoto(listing, 0);
      await as(admin).delete(`/listings/${listing}/photos/${extra.id}`).expect(200);
      for (let order = 0; order < 30; order++) await seedPhoto(listing, order);

      const res = await as(admin)
        .post(`/trash/PHOTO/${extra.id}/restore`)
        .expect(409);
      expect(res.body.error).toBe('TOO_MANY_PHOTOS');
      expect(
        await db.photo.count({ where: { listingId: listing, deletedAt: null } }),
      ).toBe(30);
    });

    it('Every restore, deactivation, settings change writes an activity entry (business)', async () => {
      const since = new Date();
      const owner = await seedOwner({ assignedToId: memberA.id });
      const listing = await seedListing({ assignedToId: memberA.id });
      const photo = await seedPhoto(listing);
      await as(admin).delete(`/listings/${listing}/photos/${photo.id}`).expect(200);
      await as(admin).delete(`/owners/${owner.id}`).expect(200);
      await as(admin).delete(`/listings/${listing}`).expect(200);
      await as(admin).post(`/trash/OWNER/${owner.id}/restore`).expect(200);
      await as(admin).post(`/trash/LISTING/${listing}/restore`).expect(200);
      await as(admin).post(`/trash/PHOTO/${photo.id}/restore`).expect(200);

      const victim = await newUser('t10-logged');
      await deactivate(admin, victim.id, null).expect(200);
      await as(admin).post(`/users/${victim.id}/reactivate`).expect(200);
      await as(admin).patch('/settings', { adCheckInDays: 14 }).expect(200);

      const entries = await db.activityEntry.findMany({
        where: { actorId: admin.id, createdAt: { gte: since } },
        select: { type: true, targetId: true, details: true },
      });
      const has = (type: string, targetId?: string) =>
        entries.filter(
          (e) => e.type === type && (!targetId || e.targetId === targetId),
        ).length;
      expect(has('RESTORE', owner.id)).toBe(1);
      expect(has('RESTORE', listing)).toBe(1);
      expect(has('RESTORE', photo.id)).toBe(1);
      expect(has('USER_DEACTIVATE', victim.id)).toBe(1);
      expect(has('USER_REACTIVATE', victim.id)).toBe(1);
      expect(
        entries.find((e) => e.type === 'SETTINGS_UPDATE')?.details,
      ).toEqual({ adCheckInDays: { from: 7, to: 14 } });

      // The activity endpoint shows them to the admin.
      const log = await as(admin)
        .get(
          `/activity?type=USER_DEACTIVATE,USER_REACTIVATE,SETTINGS_UPDATE&actorId=${admin.id}&limit=20`,
        )
        .expect(200);
      expect(log.body.data.length).toBeGreaterThanOrEqual(3);
    });
  });

  // ================================================================ settings and roles

  describe('settings', () => {
    it('Member calls `/trash`, `/activity`, `PATCH /settings` → 403 (role)', async () => {
      for (const res of [
        await as(plain).get('/trash'),
        await as(plain).get('/activity'),
        await as(plain).patch('/settings', { adCheckInDays: 5 }),
        await as(manager).patch('/settings', { adCheckInDays: 5 }),
      ]) {
        expect(res.status).toBe(403);
        expect(res.body.error).toBe('FORBIDDEN');
      }
      // Reading the settings is open to every signed-in user.
      const read = await as(plain).get('/settings').expect(200);
      expect(read.body.data).toEqual({ adCheckInDays: 7 });
      expect(
        (await db.setting.findUniqueOrThrow({ where: { id: 1 } }))
          .adCheckInDays,
      ).toBe(7);
    });

    it('Settings interval 0 or 91 → 400 (contract)', async () => {
      for (const adCheckInDays of [0, 91]) {
        const res = await as(admin)
          .patch('/settings', { adCheckInDays })
          .expect(400);
        expect(res.body.error).toBe('VALIDATION_FAILED');
      }
      for (const adCheckInDays of [1, 90]) {
        const res = await as(admin)
          .patch('/settings', { adCheckInDays })
          .expect(200);
        expect(res.body.data).toEqual({ adCheckInDays });
      }
    });

    it('Interval change applies to the next scheduled check-in, not already-open ones (contract)', async () => {
      const t0 = new Date('2026-11-02T08:00:00Z');
      frozen = t0;
      const listing = await seedListing({ assignedToId: memberA.id });
      await as(memberA)
        .put(`/listings/${listing}/ad`, {
          status: 'LIVE',
          link: 'https://www.propertyfinder.eg/en/plp/buy/villa-10.html',
        })
        .expect(200);
      const openCheckIn = () =>
        db.reminder.findFirstOrThrow({
          where: { listingId: listing, kind: 'AD_CHECK_IN', doneAt: null },
        });
      const first = await openCheckIn();
      expect(first.dueAt.getTime()).toBe(t0.getTime() + 7 * DAY);

      await as(admin).patch('/settings', { adCheckInDays: 3 }).expect(200);
      expect((await openCheckIn()).dueAt.getTime()).toBe(
        t0.getTime() + 7 * DAY,
      );

      const t1 = new Date(t0.getTime() + 7 * DAY);
      frozen = t1;
      await as(memberA)
        .post(`/listings/${listing}/ad/check-in`, { stillAvailable: true })
        .expect(200);
      const next = await openCheckIn();
      expect(next.id).not.toBe(first.id);
      expect(next.dueAt.getTime()).toBe(t1.getTime() + 3 * DAY);
    });
  });

  // ================================================================ generic checklist

  describe('generic checklist', () => {
    it('no token or an expired token → 401 on every T10 route', async () => {
      const id = randomUUID();
      const expired = signExpiredToken(admin.claims);
      const routes: [string, string][] = [
        ['post', `/api/users/${id}/deactivate`],
        ['post', `/api/users/${id}/reactivate`],
        ['get', '/api/settings'],
        ['patch', '/api/settings'],
      ];
      for (const [method, path] of routes) {
        const call = (
          http() as unknown as Record<string, (p: string) => request.Test>
        )[method](path);
        await call.send({}).expect(401);
        const call2 = (
          http() as unknown as Record<string, (p: string) => request.Test>
        )[method](path);
        await call2.set(bearer(expired)).send({}).expect(401);
      }
    });

    it('deactivate / reactivate need users.manage → 403; ids are UUIDs (400) of real users (404)', async () => {
      const target = await newUser('t10-target');
      await deactivate(plain, target.id, null).expect(403);
      await as(plain).post(`/users/${target.id}/reactivate`).expect(403);
      // A custom role with only users.manage may.
      await deactivate(manager, target.id, null).expect(200);
      await as(manager).post(`/users/${target.id}/reactivate`).expect(200);

      await deactivate(admin, 'not-a-uuid', null).expect(400);
      await as(admin).post('/users/not-a-uuid/reactivate').expect(400);
      const missing = await deactivate(admin, randomUUID(), null).expect(404);
      expect(missing.body.error).toBe('NOT_FOUND');
      await as(admin).post(`/users/${randomUUID()}/reactivate`).expect(404);
    });

    it('deactivate body: handOverTo required, a UUID or null, nothing else → 400', async () => {
      const target = await newUser('t10-body');
      for (const body of [
        {},
        { handOverTo: 'someone' },
        { handOverTo: '' },
        { handOverTo: 42 },
        { handOverTo: [memberB.id] },
        { handOverTo: null, active: false },
      ]) {
        const res = await as(admin)
          .post(`/users/${target.id}/deactivate`, body)
          .expect(400);
        expect(res.body.error).toBe('VALIDATION_FAILED');
      }
      expect(
        (await db.user.findUniqueOrThrow({ where: { id: target.id } })).active,
      ).toBe(true);
    });

    it('wrong state: deactivating an inactive user or reactivating an active one changes and logs nothing', async () => {
      const target = await newUser('t10-state');
      await as(admin).post(`/users/${target.id}/reactivate`).expect(200);
      expect(await lastEntry('USER_REACTIVATE', target.id)).toBeNull();

      await deactivate(admin, target.id, null).expect(200);
      const owner = await seedOwner({ assignedToId: memberA.id });
      const again = await deactivate(admin, target.id, memberA.id).expect(200);
      expect(again.body.data.active).toBe(false);
      expect(
        await db.activityEntry.count({
          where: { type: 'USER_DEACTIVATE', targetId: target.id },
        }),
      ).toBe(1);
      expect(
        (await db.owner.findUniqueOrThrow({ where: { id: owner.id } }))
          .assignedToId,
      ).toBe(memberA.id);
    });

    it('the deactivate answer is the User shape, without secrets', async () => {
      const target = await newUser('t10-shape');
      const res = await deactivate(admin, target.id, null).expect(200);
      expect(Object.keys(res.body.data).sort()).toEqual(
        ['active', 'createdAt', 'email', 'id', 'language', 'name', 'phone', 'role'].sort(),
      );
      expect(JSON.stringify(res.body)).not.toMatch(/passwordHash|deactivatedAt/);
    });

    it('settings body: whole days only, nothing else → 400; same value again logs nothing', async () => {
      for (const body of [
        {},
        { adCheckInDays: '7' },
        { adCheckInDays: 2.5 },
        { adCheckInDays: null },
        { adCheckInDays: -1 },
        { adCheckInDays: 7, other: true },
      ]) {
        const res = await as(admin).patch('/settings', body).expect(400);
        expect(res.body.error).toBe('VALIDATION_FAILED');
      }
      const before = await db.activityEntry.count({
        where: { type: 'SETTINGS_UPDATE', actorId: admin.id },
      });
      await as(admin).patch('/settings', { adCheckInDays: 7 }).expect(200);
      expect(
        await db.activityEntry.count({
          where: { type: 'SETTINGS_UPDATE', actorId: admin.id },
        }),
      ).toBe(before);
    });

    it('two settings changes at once → both apply in turn, each logs the value it replaced', async () => {
      const since = new Date();
      await Promise.all([
        as(admin).patch('/settings', { adCheckInDays: 10 }).expect(200),
        as(admin).patch('/settings', { adCheckInDays: 20 }).expect(200),
      ]);
      const entries = await db.activityEntry.findMany({
        where: {
          type: 'SETTINGS_UPDATE',
          actorId: admin.id,
          createdAt: { gte: since },
        },
        orderBy: { createdAt: 'asc' },
      });
      expect(entries).toHaveLength(2);
      const [a, b] = entries.map(
        (e) => (e.details as { adCheckInDays: { from: number; to: number } })
          .adCheckInDays,
      );
      expect(a.from).toBe(7);
      expect(b.from).toBe(a.to);
      const final = (await db.setting.findUniqueOrThrow({ where: { id: 1 } }))
        .adCheckInDays;
      expect(final).toBe(b.to);
    });
  });
});
