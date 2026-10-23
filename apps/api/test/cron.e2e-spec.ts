import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import type { Prisma, PrismaClient } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { configureApp } from '../src/app.setup';
import { BlobFilesGateway } from '../src/domains/cron/blob-files.gateway';
import { CronConfig } from '../src/domains/cron/cron.config';
import { BlobConfig } from '../src/domains/uploads/blob.config';
import { createTestDb, randomLocalMobile } from './helpers';
import {
  bearer,
  createUserWithToken,
  ensureBuiltInRoles,
} from './helpers-auth';

/**
 * T11 — scheduled jobs. Every cron case of the plan's T11 section is an `it` named after it.
 * The cron secret is made here per run, and Blob deletes go to a mock: no real store.
 */

type Actor = Awaited<ReturnType<typeof createUserWithToken>>;

const DAY = 24 * 60 * 60 * 1000;
const e164 = (local: string) => `+20${local.slice(1)}`;
const ago = (ms: number) => new Date(Date.now() - ms);
const STORE_HOST = 't11teststore.private.blob.vercel-storage.com';

describe('Scheduled jobs (e2e)', () => {
  let app: INestApplication;
  let db: PrismaClient;
  const http = () => request(app.getHttpServer());
  const run = `T11c-${Date.now()}`;
  /** Random per run; never a real secret. */
  const SECRET = `cron-${randomUUID()}`;
  let secret: string | undefined = SECRET;
  const deleteFiles = jest.fn<Promise<void>, [string[], string]>(() =>
    Promise.resolve(),
  );

  let admin: Actor;
  let member: Actor;
  const users: string[] = [];

  const cron = (job: string, method: 'get' | 'post' = 'get') =>
    http()[method](`/api/internal/cron/${job}`).set(bearer(SECRET));

  async function seedOwner(
    fields: Partial<Prisma.OwnerUncheckedCreateInput> = {},
  ): Promise<string> {
    const o = await db.owner.create({
      data: {
        name: `${run} owner`,
        createdById: admin.id,
        phones: { create: [{ phone: e164(randomLocalMobile()) }] },
        ...fields,
      },
    });
    return o.id;
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
        assignedToId: member.id,
        ...fields,
      },
    });
    return l.id;
  }

  async function seedPhoto(
    listingId: string,
    deletedAt: Date | null = null,
  ): Promise<{ id: string; url: string }> {
    const pathname = `listings/${listingId}/${randomUUID()}.jpg`;
    const p = await db.photo.create({
      data: {
        listingId,
        pathname,
        url: `https://${STORE_HOST}/${pathname}`,
        deletedAt,
        deletedById: deletedAt ? admin.id : null,
      },
    });
    return { id: p.id, url: p.url };
  }

  const trashed = (ms: number) => ({
    deletedAt: ago(ms),
    deletedById: admin.id,
  });

  const openCheckIns = (listingId: string) =>
    db.reminder.count({
      where: { listingId, kind: 'AD_CHECK_IN', doneAt: null },
    });

  beforeAll(async () => {
    db = createTestDb();
    const { adminRoleId, memberRoleId } = await ensureBuiltInRoles(db);
    admin = await createUserWithToken(db, 't11c-admin', adminRoleId, []);
    member = await createUserWithToken(db, 't11c-member', memberRoleId, []);
    users.push(admin.id, member.id);

    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(CronConfig)
      .useValue({ secret: () => secret })
      .overrideProvider(BlobConfig)
      .useValue({
        token: () => `vercel_blob_rw_t11teststore_${randomUUID()}`,
        hosts: () => [STORE_HOST],
      })
      .overrideProvider(BlobFilesGateway)
      .useValue({ delete: deleteFiles })
      .compile();
    app = moduleRef.createNestApplication();
    configureApp(app);
    await app.init();
  });

  afterEach(() => {
    secret = SECRET;
    deleteFiles.mockClear();
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
          ],
        },
      });
      await db.refreshToken.deleteMany({ where: { userId: where } });
      await db.loginAttempt.deleteMany({
        where: { email: { startsWith: run.toLowerCase() } },
      });
      await db.listing.deleteMany({ where: { createdById: where } });
      await db.owner.deleteMany({ where: { createdById: where } });
      await db.user.deleteMany({ where: { id: where } });
      await db.$disconnect();
    }
    await app?.close();
  });

  // ================================================================ auth

  it('Purge cron without the secret → 401 (contract)', async () => {
    for (const job of ['purge', 'ad-check-ins']) {
      for (const method of ['get', 'post'] as const) {
        const path = `/api/internal/cron/${job}`;
        const none = await http()[method](path).expect(401);
        expect(none.body).toMatchObject({
          success: false,
          error: 'UNAUTHORIZED',
        });
        await http()[method](path).set(bearer('wrong')).expect(401);
        await http()[method](path).set({ Authorization: SECRET }).expect(401);
        // A user's access token is not the cron secret.
        await http()[method](path).set(bearer(admin.token)).expect(401);
      }
    }
    // CRON_SECRET unset: refused even with an empty bearer or the old secret.
    secret = undefined;
    for (const auth of [bearer(SECRET), { Authorization: 'Bearer ' }, {}]) {
      const res = await http()
        .get('/api/internal/cron/purge')
        .set(auth)
        .expect(401);
      expect(res.body.error).toBe('CRON_NOT_CONFIGURED');
    }
    expect(deleteFiles).not.toHaveBeenCalled();
    // With the secret, GET (Vercel) and POST both run.
    secret = SECRET;
    const get = await cron('purge').expect(200);
    expect(get.body.success).toBe(true);
    await cron('purge', 'post').expect(200);
    await cron('ad-check-ins', 'post').expect(200);
  });

  // ================================================================ purge

  it('Purge removes only records deleted > 30 days ago, deletes their Blob files, keeps calls (invariant: calls never deleted; owners with calls → calls kept with owner name snapshot)', async () => {
    const oldOwner = await seedOwner({
      name: `${run} gone`,
      ...trashed(31 * DAY),
    });
    const recentOwner = await seedOwner(trashed(29 * DAY));
    const liveOwner = await seedOwner();
    const call = await db.call.create({
      data: {
        ownerId: oldOwner,
        ownerName: `${run} gone`,
        memberId: member.id,
        phone: e164(randomLocalMobile()),
        clientRequestId: randomUUID(),
      },
    });
    const oldReminder = await db.reminder.create({
      data: { ownerId: oldOwner, memberId: member.id, dueAt: ago(40 * DAY) },
    });

    const oldListing = await seedListing(trashed(31 * DAY));
    const oldListingPhotos = [
      await seedPhoto(oldListing),
      await seedPhoto(oldListing, ago(35 * DAY)),
    ];
    const recentListing = await seedListing(trashed(29 * DAY));
    const recentListingPhoto = await seedPhoto(recentListing);
    const liveListing = await seedListing();
    const oldPhoto = await seedPhoto(liveListing, ago(31 * DAY));
    const recentPhoto = await seedPhoto(liveListing, ago(29 * DAY));
    const livePhoto = await seedPhoto(liveListing);

    const res = await cron('purge').expect(200);
    expect(res.body.data.owners).toBeGreaterThanOrEqual(1);
    expect(res.body.data.listings).toBeGreaterThanOrEqual(1);
    expect(res.body.data.photos).toBeGreaterThanOrEqual(3);

    // Gone: the old owner (and its reminder), the old listing and every photo of it, the old photo.
    expect(await db.owner.count({ where: { id: oldOwner } })).toBe(0);
    expect(await db.reminder.count({ where: { id: oldReminder.id } })).toBe(0);
    expect(await db.listing.count({ where: { id: oldListing } })).toBe(0);
    const purgedPhotos = [...oldListingPhotos, oldPhoto];
    expect(
      await db.photo.count({
        where: { id: { in: purgedPhotos.map((p) => p.id) } },
      }),
    ).toBe(0);
    // Kept: anything in the trash for less than 30 days, and live records.
    expect(
      await db.owner.count({ where: { id: { in: [recentOwner, liveOwner] } } }),
    ).toBe(2);
    expect(
      await db.listing.count({
        where: { id: { in: [recentListing, liveListing] } },
      }),
    ).toBe(2);
    expect(
      await db.photo.count({
        where: {
          id: { in: [recentListingPhoto.id, recentPhoto.id, livePhoto.id] },
        },
      }),
    ).toBe(3);

    // Blob files of exactly the purged photos were deleted (with the store token).
    const deleted = deleteFiles.mock.calls.flatMap(([urls]) => urls);
    expect(deleted).toEqual(
      expect.arrayContaining(purgedPhotos.map((p) => p.url)),
    );
    for (const kept of [recentListingPhoto, recentPhoto, livePhoto]) {
      expect(deleted).not.toContain(kept.url);
    }
    expect(deleteFiles.mock.calls[0]?.[1]).toMatch(/^vercel_blob_rw_/);

    // The call survives with the owner's name.
    const kept = await db.call.findUniqueOrThrow({ where: { id: call.id } });
    expect(kept).toMatchObject({ ownerId: null, ownerName: `${run} gone` });

    // Idempotent: a second run finds nothing of this, deletes no file.
    deleteFiles.mockClear();
    const again = await cron('purge').expect(200);
    expect(again.body.data).toMatchObject({
      owners: 0,
      listings: 0,
      photos: 0,
    });
    expect(deleteFiles.mock.calls.flatMap(([urls]) => urls)).toEqual([]);
    // The restore of a purged owner answers 410 PURGED once its DELETE is in the log.
  });

  it('Purge keeps the rows when the Blob delete fails (the next run retries)', async () => {
    const listing = await seedListing();
    const photo = await seedPhoto(listing, ago(31 * DAY));
    // A trashed listing whose photo file can't be removed stays too (no cascade past the file).
    const trashedListing = await seedListing(trashed(31 * DAY));
    const trashedPhoto = await seedPhoto(trashedListing);
    deleteFiles.mockRejectedValue(new Error('blob down'));
    const failed = await cron('purge').expect(200);
    expect(failed.body.data.photos).toBe(0);
    expect(
      await db.photo.count({
        where: { id: { in: [photo.id, trashedPhoto.id] } },
      }),
    ).toBe(2);
    expect(await db.listing.count({ where: { id: trashedListing } })).toBe(1);
    deleteFiles.mockResolvedValue(undefined);
    await cron('purge').expect(200);
    expect(
      await db.photo.count({
        where: { id: { in: [photo.id, trashedPhoto.id] } },
      }),
    ).toBe(0);
    expect(await db.listing.count({ where: { id: trashedListing } })).toBe(0);
  });

  it('Purge cron also deletes refresh tokens expired > 30 days and login attempts older than 1 day (T4 follow-up)', async () => {
    const token = (expiresAt: Date) =>
      db.refreshToken.create({
        data: {
          userId: member.id,
          tokenHash: `${run}-${randomUUID()}`,
          familyId: randomUUID(),
          expiresAt,
        },
      });
    const old = await token(ago(31 * DAY));
    const recent = await token(ago(29 * DAY));
    const valid = await token(new Date(Date.now() + 10 * DAY));
    const attempt = (createdAt: Date) =>
      db.loginAttempt.create({
        data: { email: `${run.toLowerCase()}@test.localhost`, createdAt },
      });
    const oldAttempt = await attempt(ago(DAY + 60_000));
    const newAttempt = await attempt(ago(DAY - 60_000));

    const res = await cron('purge').expect(200);
    expect(res.body.data.refreshTokens).toBeGreaterThanOrEqual(1);
    expect(res.body.data.loginAttempts).toBeGreaterThanOrEqual(1);
    const tokens = await db.refreshToken.findMany({
      where: { id: { in: [old.id, recent.id, valid.id] } },
      select: { id: true },
    });
    expect(tokens.map((t) => t.id).sort()).toEqual(
      [recent.id, valid.id].sort(),
    );
    const attempts = await db.loginAttempt.findMany({
      where: { id: { in: [oldAttempt.id, newAttempt.id] } },
      select: { id: true },
    });
    expect(attempts.map((a) => a.id)).toEqual([newAttempt.id]);
  });

  // ================================================================ ad check-ins

  it('Ad safety-net cron: LIVE ad with no open check-in gets one; LIVE ad with one gets none extra (contract)', async () => {
    const setting = await db.setting.findUnique({ where: { id: 1 } });
    const days = setting?.adCheckInDays ?? 7;
    const missing = await seedListing({
      adStatus: 'LIVE',
      adLink: 'https://www.propertyfinder.eg/x',
      adPostedAt: ago(DAY),
    });
    const overdue = await seedListing({
      adStatus: 'LIVE',
      adPostedAt: ago(100 * DAY),
      lastCheckInAt: ago(60 * DAY),
    });
    const covered = await seedListing({
      adStatus: 'LIVE',
      adPostedAt: ago(DAY),
    });
    await db.reminder.create({
      data: {
        kind: 'AD_CHECK_IN',
        listingId: covered,
        memberId: member.id,
        dueAt: new Date(Date.now() + 3 * DAY),
      },
    });
    const doubled = await seedListing({
      adStatus: 'LIVE',
      adPostedAt: ago(DAY),
    });
    const first = await db.reminder.create({
      data: {
        kind: 'AD_CHECK_IN',
        listingId: doubled,
        memberId: member.id,
        dueAt: new Date(Date.now() + 2 * DAY),
      },
    });
    await db.reminder.create({
      data: {
        kind: 'AD_CHECK_IN',
        listingId: doubled,
        memberId: member.id,
        dueAt: new Date(Date.now() + 5 * DAY),
      },
    });

    const before = Date.now();
    const res = await cron('ad-check-ins').expect(200);
    expect(res.body.data.added).toBeGreaterThanOrEqual(2);
    expect(res.body.data.duplicatesRemoved).toBeGreaterThanOrEqual(1);

    for (const id of [missing, overdue, covered, doubled]) {
      expect(await openCheckIns(id)).toBe(1);
    }
    const added = await db.reminder.findFirstOrThrow({
      where: { listingId: missing, kind: 'AD_CHECK_IN', doneAt: null },
    });
    // For the listing's member, one interval after going Live.
    expect(added.memberId).toBe(member.id);
    expect(
      Math.abs(added.dueAt.getTime() - (Date.now() - DAY + days * DAY)),
    ).toBeLessThan(60_000);
    // Already past its time: due now, not in the past.
    const late = await db.reminder.findFirstOrThrow({
      where: { listingId: overdue, kind: 'AD_CHECK_IN', doneAt: null },
    });
    expect(late.dueAt.getTime()).toBeGreaterThanOrEqual(before - 1000);
    expect(late.dueAt.getTime()).toBeLessThanOrEqual(Date.now() + 1000);
    // The duplicate kept is the earliest due.
    expect(
      (
        await db.reminder.findFirstOrThrow({
          where: { listingId: doubled, kind: 'AD_CHECK_IN', doneAt: null },
        })
      ).id,
    ).toBe(first.id);

    // Idempotent.
    await cron('ad-check-ins').expect(200);
    for (const id of [missing, overdue, covered, doubled]) {
      expect(await openCheckIns(id)).toBe(1);
    }
  });

  it("Ad safety-net cron skips listings that aren't AVAILABLE or are deleted (business: check-ins only while for sale)", async () => {
    const sold = await seedListing({ adStatus: 'LIVE', status: 'SOLD' });
    const offMarket = await seedListing({
      adStatus: 'LIVE',
      status: 'OFF_MARKET',
    });
    const deleted = await seedListing({
      adStatus: 'LIVE',
      ...trashed(DAY),
    });
    const notPosted = await seedListing({ adStatus: 'NOT_POSTED' });
    const takenDown = await seedListing({ adStatus: 'TAKEN_DOWN' });
    await cron('ad-check-ins').expect(200);
    for (const id of [sold, offMarket, deleted, notPosted, takenDown]) {
      expect(await openCheckIns(id)).toBe(0);
    }
  });

  it('Ad safety-net cron removes duplicate check-ins only on Live ads of Available listings', async () => {
    const sold = await seedListing({ adStatus: 'LIVE', status: 'SOLD' });
    const deleted = await seedListing({ adStatus: 'LIVE', ...trashed(DAY) });
    for (const listingId of [sold, deleted]) {
      for (const inDays of [2, 5]) {
        await db.reminder.create({
          data: {
            kind: 'AD_CHECK_IN',
            listingId,
            memberId: member.id,
            dueAt: new Date(Date.now() + inDays * DAY),
          },
        });
      }
    }
    await cron('ad-check-ins').expect(200);
    for (const id of [sold, deleted]) {
      expect(await openCheckIns(id)).toBe(2);
    }
  });
});
