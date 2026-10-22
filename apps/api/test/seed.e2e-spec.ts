import type { PrismaClient } from '@prisma/client';
import { DEFAULT_CALL_OUTCOMES } from '@prime-crm/shared';
import { seedFoundation } from '../prisma/seed-foundation';
import {
  cairoEndOfDay,
  SAMPLE_ACCOUNTS,
  sampleId,
  sampleSeedGate,
  seedSample,
  TEAM_LEAD_ROLE,
} from '../prisma/seed-sample';
import { verifyPassword } from '../src/common/utils/password.util';
import { createScratchDatabase, randomPassword } from './helpers';

/**
 * T2 — the sample seed. Runs on a scratch database of its own (created and dropped here), so it
 * never mixes sample rows into the shared e2e database.
 */
describe('Sample seed (e2e, scratch database)', () => {
  let scratch: Awaited<ReturnType<typeof createScratchDatabase>>;
  let db: PrismaClient;
  const adminPassword = randomPassword();
  const memberPassword = randomPassword();
  const now = new Date();

  async function seedAll(): Promise<void> {
    await seedFoundation(db, {
      email: SAMPLE_ACCOUNTS.admin,
      password: adminPassword,
    });
    await seedSample(db, { adminPassword, memberPassword, now });
  }

  async function counts(): Promise<Record<string, number>> {
    return {
      roles: await db.role.count(),
      users: await db.user.count(),
      owners: await db.owner.count(),
      ownerPhones: await db.ownerPhone.count(),
      ownerAssignments: await db.ownerAssignment.count(),
      calls: await db.call.count(),
      callOutcomes: await db.callOutcome.count(),
      reminders: await db.reminder.count(),
      notes: await db.note.count(),
      listings: await db.listing.count(),
      photos: await db.photo.count(),
      importJobs: await db.importJob.count(),
      importRows: await db.importRow.count(),
      activity: await db.activityEntry.count(),
      settings: await db.setting.count(),
    };
  }

  let first: Record<string, number>;

  beforeAll(async () => {
    scratch = await createScratchDatabase('seed');
    db = scratch.db;
    await seedAll();
    first = await counts();
  }, 120_000);

  afterAll(async () => {
    await scratch?.drop();
  });

  describe('gate', () => {
    it('skips when SEED_ALLOW_SAMPLE is unset or not "true"', () => {
      expect(sampleSeedGate({})).toBe('skip');
      expect(sampleSeedGate({ SEED_ALLOW_SAMPLE: 'false' })).toBe('skip');
      expect(sampleSeedGate({ SEED_ALLOW_SAMPLE: '1' })).toBe('skip');
      expect(
        sampleSeedGate({ NODE_ENV: 'production', SEED_ALLOW_SAMPLE: '' }),
      ).toBe('skip');
    });

    it('runs with SEED_ALLOW_SAMPLE=true outside production', () => {
      expect(sampleSeedGate({ SEED_ALLOW_SAMPLE: 'true' })).toBe('run');
      expect(
        sampleSeedGate({ NODE_ENV: 'development', SEED_ALLOW_SAMPLE: 'TRUE' }),
      ).toBe('run');
    });

    it('refuses SEED_ALLOW_SAMPLE=true with NODE_ENV=production', () => {
      expect(() =>
        sampleSeedGate({ NODE_ENV: 'production', SEED_ALLOW_SAMPLE: 'true' }),
      ).toThrow(/production/);
    });
  });

  it('sampleId is stable and UUID-shaped', () => {
    expect(sampleId('owner', 1)).toBe(sampleId('owner', 1));
    expect(sampleId('owner', 1)).not.toBe(sampleId('owner', 2));
    expect(sampleId('owner', 1)).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-5[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
    );
  });

  it('is idempotent: a second and third run leave every table count unchanged', async () => {
    await seedAll();
    expect(await counts()).toEqual(first);
    await seedSample(db, { adminPassword, memberPassword });
    expect(await counts()).toEqual(first);
  });

  it('creates the expected volume', () => {
    expect(first).toMatchObject({
      roles: 3,
      users: 5,
      owners: 60,
      listings: 20,
      callOutcomes: 10,
      importJobs: 1,
      importRows: 15,
      settings: 1,
    });
  });

  it('seeds an account per role, signing in with the env passwords', async () => {
    const users = await db.user.findMany({ include: { role: true } });
    const by = (email: string) => users.find((u) => u.email === email);
    expect(by(SAMPLE_ACCOUNTS.admin)?.role.builtIn).toBe('ADMIN');
    expect(by(SAMPLE_ACCOUNTS.sara)?.role.builtIn).toBe('TEAM_MEMBER');
    expect(by(SAMPLE_ACCOUNTS.omar)?.role.builtIn).toBe('TEAM_MEMBER');
    expect(by(SAMPLE_ACCOUNTS.lead)?.role).toMatchObject({
      name: TEAM_LEAD_ROLE.name,
      builtIn: null,
      permissions: [...TEAM_LEAD_ROLE.permissions],
    });
    expect(by(SAMPLE_ACCOUNTS.deactivated)).toMatchObject({
      active: false,
      deactivatedAt: expect.any(Date),
    });
    await expect(
      verifyPassword(adminPassword, by(SAMPLE_ACCOUNTS.admin)!.passwordHash),
    ).resolves.toBe(true);
    await expect(
      verifyPassword(memberPassword, by(SAMPLE_ACCOUNTS.sara)!.passwordHash),
    ).resolves.toBe(true);
  });

  it('covers every lead status, Arabic and English names, multi-phone, unassigned and trashed owners', async () => {
    const live = await db.owner.findMany({
      where: { deletedAt: null },
      include: { phones: true },
    });
    expect(new Set(live.map((o) => o.status))).toEqual(
      new Set([
        'NEW',
        'CONTACTED',
        'INTERESTED',
        'NOT_INTERESTED',
        'CALL_BACK',
        'LISTED',
        'DO_NOT_CALL',
      ]),
    );
    expect(live.some((o) => /[؀-ۿ]/.test(o.name))).toBe(true);
    expect(live.some((o) => /^[A-Za-z]/.test(o.name))).toBe(true);
    expect(live.some((o) => o.phones.length === 3)).toBe(true);
    expect(live.some((o) => o.phones.length === 2)).toBe(true);
    expect(live.filter((o) => o.assignedToId === null).length).toBeGreaterThan(
      0,
    );
    expect(live.filter((o) => o.sourceImportId !== null)).toHaveLength(12);

    const trashed = await db.owner.findMany({
      where: { deletedAt: { not: null } },
    });
    expect(trashed).toHaveLength(1);
    const ageDays =
      (now.getTime() - trashed[0].deletedAt!.getTime()) / 86_400_000;
    expect(ageDays).toBeCloseTo(5, 1);
  });

  it('uses every default outcome, and leaves one call with no outcome', async () => {
    const used = await db.callOutcome.findMany({
      where: { calls: { some: {} } },
    });
    expect(used.map((o) => o.labelEn).sort()).toEqual(
      DEFAULT_CALL_OUTCOMES.map((o) => o.labelEn).sort(),
    );
    expect(await db.call.count({ where: { outcomeId: null } })).toBe(1);
  });

  it('has reminders overdue, due today, upcoming, done, and one unassigned open', async () => {
    const open = await db.reminder.findMany({
      where: { doneAt: null, kind: 'MANUAL' },
    });
    const endOfToday = cairoEndOfDay(now);
    expect(open.some((r) => r.dueAt < now)).toBe(true);
    expect(open.some((r) => r.dueAt >= now && r.dueAt < endOfToday)).toBe(true);
    expect(open.some((r) => r.dueAt >= endOfToday)).toBe(true);
    expect(open.filter((r) => r.memberId === null)).toHaveLength(1);
    expect(
      await db.reminder.count({ where: { doneAt: { not: null } } }),
    ).toBeGreaterThan(0);
  });

  it('covers every listing type, status and ad state, linked and direct, and a trashed listing', async () => {
    const listings = await db.listing.findMany({
      include: { reminders: true, photos: true },
    });
    expect(new Set(listings.map((l) => l.type)).size).toBe(11);
    expect(new Set(listings.map((l) => l.status)).size).toBe(4);
    expect(new Set(listings.map((l) => l.purpose)).size).toBe(2);
    expect(new Set(listings.map((l) => l.adStatus)).size).toBe(3);
    expect(listings.filter((l) => l.ownerId !== null)).toHaveLength(8);
    expect(listings.filter((l) => l.deletedAt !== null)).toHaveLength(1);
    expect(listings.some((l) => l.photos.length > 0)).toBe(true);

    const openTask = (l: (typeof listings)[number], kind: string) =>
      l.reminders.some((r) => r.kind === kind && r.doneAt === null);
    const live = listings.filter((l) => l.adStatus === 'LIVE');
    // One live ad with a check-in overdue, others fine.
    expect(
      live.filter((l) =>
        l.reminders.some(
          (r) => r.kind === 'AD_CHECK_IN' && !r.doneAt && r.dueAt < now,
        ),
      ),
    ).toHaveLength(1);
    expect(
      live.some((l) =>
        l.reminders.some(
          (r) => r.kind === 'AD_CHECK_IN' && !r.doneAt && r.dueAt > now,
        ),
      ),
    ).toBe(true);
    // One open take-down task, on a listing no longer Available whose ad is still live.
    const takeDown = listings.filter((l) => openTask(l, 'AD_TAKE_DOWN'));
    expect(takeDown).toHaveLength(1);
    expect(takeDown[0]).toMatchObject({ adStatus: 'LIVE', status: 'SOLD' });

    // Linked listings' owners are LISTED and share the listing's member.
    const linked = await db.listing.findMany({
      where: { ownerId: { not: null } },
      include: { owner: true },
    });
    for (const l of linked) {
      expect(l.owner?.status).toBe('LISTED');
      expect(l.owner?.assignedToId).toBe(l.assignedToId);
    }
  });

  it('has an import that finished with duplicates and a rejected row', async () => {
    const job = await db.importJob.findFirstOrThrow({
      include: { rows: true },
    });
    expect(job).toMatchObject({
      status: 'DONE',
      addedCount: 12,
      duplicateCount: 2,
      rejectedCount: 1,
    });
    expect(job.rows.filter((r) => r.issue === 'DUPLICATE')).toHaveLength(2);
    expect(job.rows.filter((r) => r.issue === 'INVALID_PHONE')).toHaveLength(1);
  });
});
