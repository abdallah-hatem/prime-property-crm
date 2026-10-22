import type { PrismaClient } from '@prisma/client';
import { toE164 } from '@prime-crm/shared';
import { seedFoundation } from '../prisma/seed-foundation';
import { ActivityEntryRepository } from '../src/common/repositories/activity-entry.repository';
import type { DatabaseService } from '../src/database/database.service';
import { CallRepository } from '../src/domains/calls/repositories/call.repository';
import {
  createTestDb,
  dbError,
  randomLocalMobile,
  randomPassword,
  uniqueEmail,
} from './helpers';

/**
 * T1 — data model. Each `it` is one edge case from the plan (T1 section), named after it.
 * Runs against the test database with migrations applied by global-setup.
 */
describe('Data model (e2e, test database)', () => {
  let db: PrismaClient;
  let adminUserId: string;
  let teamMemberRoleId: string;
  const seedAdmin = {
    email: uniqueEmail('seed-admin'),
    password: randomPassword(),
  };

  // Everything this suite creates, removed in dependency order in afterAll.
  const created = {
    users: [] as string[],
    owners: [] as string[],
    outcomes: [] as string[],
  };

  async function makeUser(label: string): Promise<string> {
    const user = await db.user.create({
      data: {
        name: `T1 ${label}`,
        email: uniqueEmail(label),
        passwordHash: 'not-a-real-hash',
        roleId: teamMemberRoleId,
      },
    });
    created.users.push(user.id);
    return user.id;
  }

  async function makeOwner(
    phones: string[],
    deletedAt?: Date,
  ): Promise<string> {
    const owner = await db.owner.create({
      data: {
        name: 'مالك تجريبي',
        createdById: adminUserId,
        deletedAt,
        deletedById: deletedAt ? adminUserId : undefined,
        phones: {
          create: phones.map((phone, position) => ({ phone, position })),
        },
      },
    });
    created.owners.push(owner.id);
    return owner.id;
  }

  function e164(local: string): string {
    const phone = toE164(local);
    if (!phone) throw new Error(`test phone ${local} did not normalise`);
    return phone;
  }

  function listingData(price: number, sizeSqm = 120) {
    return {
      purpose: 'SALE' as const,
      type: 'APARTMENT' as const,
      area: 'New Cairo',
      sizeSqm,
      price,
      ownerName: 'Owner',
      ownerPhone: e164(randomLocalMobile()),
      createdById: adminUserId,
    };
  }

  beforeAll(async () => {
    db = createTestDb();
    const seeded = await seedFoundation(db, seedAdmin);
    adminUserId = seeded.adminUserId;
    teamMemberRoleId = seeded.teamMemberRoleId;
  });

  afterAll(async () => {
    if (!db) return;
    const users = [...created.users, adminUserId];
    // Test teardown only: the app has no path that deletes calls or activity entries.
    await db.call.deleteMany({ where: { memberId: { in: users } } });
    await db.activityEntry.deleteMany({ where: { actorId: { in: users } } });
    await db.listing.deleteMany({ where: { createdById: { in: users } } });
    await db.owner.deleteMany({ where: { createdById: { in: users } } });
    await db.callOutcome.deleteMany({
      where: { id: { in: created.outcomes } },
    });
    await db.user.deleteMany({ where: { id: { in: users } } });
    await db.$disconnect();
  });

  it('Two owners with the same normalised phone → DB unique violation', async () => {
    const local = randomLocalMobile();
    await makeOwner([e164(local)]);
    // The same number typed another way normalises to the same E.164 string.
    const typedDifferently = `+20 ${local.slice(1, 4)} ${local.slice(4, 7)} ${local.slice(7)}`;
    expect(e164(typedDifferently)).toBe(e164(local));

    expect(await dbError(makeOwner([e164(typedDifferently)]))).toContain(
      'P2002',
    );
  });

  it("Same phone on an owner's second phone slot as another owner's first → violation", async () => {
    const shared = e164(randomLocalMobile());
    await makeOwner([shared]);

    const error = await dbError(makeOwner([e164(randomLocalMobile()), shared]));
    expect(error).toContain('P2002');
  });

  it('A call row cannot be deleted through the repository layer (no delete method)', async () => {
    const calls = new CallRepository(db as unknown as DatabaseService);
    expect('delete' in calls).toBe(false);
    expect('update' in calls).toBe(false);
    // @ts-expect-error — the type has no delete either; this line fails to compile if one appears.
    expect(calls.delete).toBeUndefined();

    const member = await makeUser('caller');
    const ownerId = await makeOwner([e164(randomLocalMobile())]);
    const call = await calls.create({
      ownerId,
      ownerName: 'مالك تجريبي',
      memberId: member,
      phone: '+201000000000',
      clientRequestId: crypto.randomUUID(),
    });
    await expect(calls.findById(call.id)).resolves.toMatchObject({
      id: call.id,
    });
  });

  it('deleting an owner referenced by a call nulls the link and keeps the call with its owner name', async () => {
    const member = await makeUser('caller');
    const ownerId = await makeOwner([e164(randomLocalMobile())]);
    const call = await db.call.create({
      data: {
        ownerId,
        ownerName: 'Purged Owner',
        memberId: member,
        phone: '+201000000001',
        clientRequestId: crypto.randomUUID(),
      },
    });

    // The 30-day purge removes the owner row for good.
    await db.owner.delete({ where: { id: ownerId } });

    const after = await db.call.findUnique({ where: { id: call.id } });
    expect(after).toMatchObject({ ownerId: null, ownerName: 'Purged Owner' });
  });

  it('deleting a user referenced by a call fails and the call stays', async () => {
    const member = await makeUser('caller');
    const call = await db.call.create({
      data: {
        ownerName: 'Someone',
        memberId: member,
        phone: '+201000000002',
        clientRequestId: crypto.randomUUID(),
      },
    });

    expect(await dbError(db.user.delete({ where: { id: member } }))).toContain(
      'P2003',
    );
    await expect(
      db.call.findUnique({ where: { id: call.id } }),
    ).resolves.not.toBeNull();
  });

  it('A call id is idempotent per member: the same clientRequestId twice → unique violation', async () => {
    const member = await makeUser('double-tap');
    const clientRequestId = crypto.randomUUID();
    const data = {
      ownerName: 'Someone',
      memberId: member,
      phone: '+201000000003',
      clientRequestId,
    };
    await db.call.create({ data });
    expect(await dbError(db.call.create({ data }))).toContain('P2002');
  });

  it('Activity entries have no update/delete path', async () => {
    const activity = new ActivityEntryRepository(
      db as unknown as DatabaseService,
    );
    expect('delete' in activity).toBe(false);
    expect('update' in activity).toBe(false);
    // @ts-expect-error — no update on the type either.
    expect(activity.update).toBeUndefined();

    const entry = await activity.create({
      type: 'SETTINGS_UPDATE',
      actorId: adminUserId,
      summary: 'T1 probe',
      details: { adCheckInDays: { from: 7, to: 7 } },
    });
    await expect(activity.findById(entry.id)).resolves.toMatchObject({
      summary: 'T1 probe',
    });
  });

  it('Seed is idempotent: running it twice leaves one Admin role, one Team member role, the 10 default outcomes, one settings row', async () => {
    const before = await db.user.findUniqueOrThrow({
      where: { id: adminUserId },
    });

    // beforeAll ran it once; run it twice more.
    await seedFoundation(db, seedAdmin);
    await seedFoundation(db, { ...seedAdmin, password: randomPassword() });

    expect(await db.role.count({ where: { builtIn: 'ADMIN' } })).toBe(1);
    expect(await db.role.count({ where: { builtIn: 'TEAM_MEMBER' } })).toBe(1);
    expect(
      await db.role.count({
        where: { name: { in: ['Admin', 'Team member'] } },
      }),
    ).toBe(2);
    expect(
      await db.callOutcome.count({
        where: { id: { notIn: created.outcomes } },
      }),
    ).toBe(10);
    expect(await db.setting.findMany()).toEqual([
      expect.objectContaining({ id: 1, adCheckInDays: 7 }),
    ]);
    // The admin is created once and a re-seed never resets their password.
    expect(await db.user.count({ where: { email: seedAdmin.email } })).toBe(1);
    const after = await db.user.findUniqueOrThrow({
      where: { id: adminUserId },
    });
    expect(after.passwordHash).toBe(before.passwordHash);

    const admin = await db.role.findUniqueOrThrow({
      where: { builtIn: 'ADMIN' },
    });
    expect(admin.permissions).toHaveLength(12);
    const member = await db.role.findUniqueOrThrow({
      where: { builtIn: 'TEAM_MEMBER' },
    });
    expect(member.permissions).toEqual([]);
  });

  it('Default outcomes map exactly as the business doc table', async () => {
    // Written out from docs/BUSINESS_LOGIC.md ("Call outcome"), not imported from the seed.
    const businessDoc: Record<string, string> = {
      'No answer': 'CONTACTED',
      Busy: 'CONTACTED',
      'Switched off': 'CONTACTED',
      'Interested to sell': 'INTERESTED',
      'Interested to rent': 'INTERESTED',
      'Not interested': 'NOT_INTERESTED',
      'Already sold or rented': 'NOT_INTERESTED',
      'Call back later': 'CALL_BACK',
      'Wrong number': 'DO_NOT_CALL',
      'Do not call again': 'DO_NOT_CALL',
    };

    const rows = await db.callOutcome.findMany({
      where: { id: { notIn: created.outcomes } },
      orderBy: { order: 'asc' },
    });
    expect(
      Object.fromEntries(rows.map((r) => [r.labelEn, r.setsStatus])),
    ).toEqual(businessDoc);
    expect(rows.every((r) => r.labelAr.trim().length > 0 && !r.hidden)).toBe(
      true,
    );
  });

  it('No outcome can set LISTED (DB check)', async () => {
    const error = await dbError(
      db.callOutcome.create({
        data: { labelEn: 'Listed', labelAr: 'معروض', setsStatus: 'LISTED' },
      }),
    );
    expect(error).toContain('call_outcomes_not_listed_check');
  });

  it('Price stored as integer EGP; price over 1,000,000,000 rejected (DB check; DTO comes later)', async () => {
    const top = await db.listing.create({ data: listingData(1_000_000_000) });
    const bottom = await db.listing.create({ data: listingData(1) });
    expect(bottom.price).toBe(1);
    expect(top.price).toBe(1_000_000_000);
    expect(Number.isInteger(top.price)).toBe(true);

    const column = await db.$queryRaw<{ data_type: string }[]>`
      SELECT data_type FROM information_schema.columns
      WHERE table_name = 'listings' AND column_name = 'price'`;
    expect(column).toEqual([{ data_type: 'integer' }]);

    expect(
      await dbError(db.listing.create({ data: listingData(1_000_000_001) })),
    ).toContain('listings_price_range_check');
    expect(
      await dbError(db.listing.create({ data: listingData(0) })),
    ).toContain('listings_price_range_check');
    // The ORM truncates a fraction silently (1500.5 → 1500) rather than refusing it, so the
    // listing DTO must reject non-integers (@IsInt) — the database can't tell.
    const truncated = await db.listing.create({ data: listingData(1500.5) });
    expect(truncated.price).toBe(1500);
  });

  it('Listing size must be positive (DB check)', async () => {
    expect(
      await dbError(db.listing.create({ data: listingData(100, 0) })),
    ).toContain('listings_size_sqm_positive_check');
  });

  it('A live listing per owner phone and per owner; a trashed listing frees both', async () => {
    const ownerId = await makeOwner([e164(randomLocalMobile())]);
    const first = await db.listing.create({
      data: { ...listingData(100), ownerId },
    });

    expect(
      await dbError(
        db.listing.create({ data: { ...listingData(100), ownerId } }),
      ),
    ).toContain('P2002');
    expect(
      await dbError(
        db.listing.create({
          data: { ...listingData(100), ownerPhone: first.ownerPhone },
        }),
      ),
    ).toContain('P2002');

    await db.listing.update({
      where: { id: first.id },
      data: { deletedAt: new Date() },
    });
    await expect(
      db.listing.create({
        data: { ...listingData(100), ownerId, ownerPhone: first.ownerPhone },
      }),
    ).resolves.toMatchObject({ ownerId, ownerPhone: first.ownerPhone });
  });

  it('Reminders and notes belong to exactly one owner or listing (DB check)', async () => {
    const member = await makeUser('reminders');
    const ownerId = await makeOwner([e164(randomLocalMobile())]);
    const listing = await db.listing.create({ data: listingData(500) });
    const dueAt = new Date(Date.now() + 86_400_000);

    for (const target of [{}, { ownerId, listingId: listing.id }]) {
      expect(
        await dbError(
          db.reminder.create({ data: { ...target, memberId: member, dueAt } }),
        ),
      ).toContain('reminders_owner_xor_listing_check');
      expect(
        await dbError(
          db.note.create({ data: { ...target, authorId: member, body: 'x' } }),
        ),
      ).toContain('notes_owner_xor_listing_check');
    }

    await db.reminder.create({ data: { ownerId, memberId: null, dueAt } });
    await db.note.create({
      data: { listingId: listing.id, authorId: member, body: 'ملاحظة' },
    });
  });

  it("Foreign keys from Call (owner, member, outcome) and ActivityEntry (actor) don't cascade", async () => {
    const rules = await db.$queryRaw<{ name: string; on_delete: string }[]>`
      SELECT conname AS name, confdeltype::text AS on_delete FROM pg_constraint
      WHERE contype = 'f' AND conrelid::regclass::text IN ('calls', 'activity_entries')
      ORDER BY conname`;
    // r = RESTRICT, n = SET NULL; never c (CASCADE).
    expect(rules).toEqual([
      { name: 'activity_entries_actor_id_fkey', on_delete: 'r' },
      { name: 'calls_member_id_fkey', on_delete: 'r' },
      { name: 'calls_outcome_id_fkey', on_delete: 'r' },
      { name: 'calls_owner_id_fkey', on_delete: 'n' },
    ]);

    // Behaviour, not just metadata: each parent delete fails and the child row stays.
    const actor = await makeUser('actor');
    const outcome = await db.callOutcome.create({
      data: {
        labelEn: 'T1 outcome',
        labelAr: 'نتيجة',
        setsStatus: 'CONTACTED',
        order: 99,
      },
    });
    created.outcomes.push(outcome.id);
    const call = await db.call.create({
      data: {
        ownerName: 'Someone',
        memberId: actor,
        phone: '+201000000004',
        clientRequestId: crypto.randomUUID(),
        outcomeId: outcome.id,
        outcomeAt: new Date(),
      },
    });
    const entry = await db.activityEntry.create({
      data: { type: 'EXPORT', actorId: actor, summary: 'T1 export' },
    });

    expect(
      await dbError(db.callOutcome.delete({ where: { id: outcome.id } })),
    ).toContain('P2003');
    expect(await dbError(db.user.delete({ where: { id: actor } }))).toContain(
      'P2003',
    );
    await expect(
      db.call.findUnique({ where: { id: call.id } }),
    ).resolves.not.toBeNull();
    await expect(
      db.activityEntry.findUnique({ where: { id: entry.id } }),
    ).resolves.not.toBeNull();
  });

  it('A trashed owner still holds its phones: inserting a new owner with that phone violates the unique index', async () => {
    const phone = e164(randomLocalMobile());
    const trashedId = await makeOwner([phone], new Date());
    await expect(
      db.owner.findUnique({ where: { id: trashedId } }),
    ).resolves.toMatchObject({
      deletedAt: expect.any(Date),
    });

    expect(await dbError(makeOwner([phone]))).toContain('P2002');
  });

  it('Settings is a single row with a 1–90 day interval (DB check)', async () => {
    expect(
      await dbError(db.setting.create({ data: { id: 2, adCheckInDays: 7 } })),
    ).toContain('settings_singleton_check');
    expect(
      await dbError(
        db.setting.update({ where: { id: 1 }, data: { adCheckInDays: 91 } }),
      ),
    ).toContain('settings_ad_check_in_days_check');
  });
});
