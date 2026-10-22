import {
  Controller,
  Get,
  Injectable,
  type INestApplication,
  Param,
  ParseUUIDPipe,
} from '@nestjs/common';
import { Test } from '@nestjs/testing';
import type { Owner, Prisma, PrismaClient } from '@prisma/client';
import { PERMISSION_KEYS, type Permission } from '@prime-crm/shared';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { configureApp } from '../src/app.setup';
import { GetUser } from '../src/common/decorators/get-user.decorator';
import { RequirePermission } from '../src/common/decorators/require-permission.decorator';
import type { CurrentUser } from '../src/common/interfaces/current-user.interface';
import { Clock } from '../src/common/providers/clock';
import { SoftDeleteRepository } from '../src/common/repositories/soft-delete.repository';
import { assertFound, ownerScope } from '../src/common/utils/ownership.util';
import { DatabaseService } from '../src/database/database.service';
import { ActivityService } from '../src/domains/activity/activity.service';
import { TrashService } from '../src/domains/trash/trash.service';
import { createTestDb } from './helpers';
import {
  bearer,
  createUserWithToken,
  ensureBuiltInRoles,
  signExpiredToken,
} from './helpers-auth';

/**
 * T3 — common core: permissions, ownership, activity writer, soft delete and trash.
 * Each edge case from the plan (T3 section, plus T10's trash timing/access cases) is an `it`
 * named after it. Users, roles and tokens are made here; nothing depends on the seed.
 */

/** A permission that isn't in the fixed list yet: "added to the list later". */
const ADDED_LATER = 'reports.view' as Permission;
const PROBE_KEYS: Permission[] = [...PERMISSION_KEYS, ADDED_LATER];

/** A trashable-model repository built on the shared base, as the owners task will build one. */
@Injectable()
class OwnerProbeRepository extends SoftDeleteRepository<
  Owner,
  Prisma.OwnerUncheckedCreateInput,
  Prisma.OwnerUncheckedUpdateInput,
  Prisma.OwnerWhereInput
> {
  constructor(db: DatabaseService) {
    super(db, (client) => client.owner);
  }
}

/** Test-only routes: one per permission key, plus an "own or owners.viewAll" owner lookup. */
@Controller('t3-probe')
class ProbeController {
  constructor(private readonly owners: OwnerProbeRepository) {}

  @Get('me')
  me(@GetUser() user: CurrentUser) {
    return user;
  }

  @Get('owners/:id')
  async owner(
    @Param('id', ParseUUIDPipe) id: string,
    @GetUser() user: CurrentUser,
  ) {
    const owner = await this.owners.findFirst({
      id,
      ...ownerScope(user, 'assignedToId', { bypass: 'owners.viewAll' }),
    });
    return { id: assertFound(owner, 'Owner').id };
  }
}
for (const key of PROBE_KEYS) {
  const name = `probe:${key}`;
  const proto = ProbeController.prototype as unknown as Record<string, unknown>;
  proto[name] = () => ({ key });
  const descriptor = Object.getOwnPropertyDescriptor(proto, name)!;
  Get(`perm/${key}`)(proto, name, descriptor);
  RequirePermission(key)(proto, name, descriptor);
}

const DAY = 24 * 3_600_000;
const MINUTE = 60_000;

describe('Common core (e2e)', () => {
  let app: INestApplication;
  let db: PrismaClient;
  let clock: Clock;
  let now: Date;
  const http = () => request(app.getHttpServer());

  type Actor = Awaited<ReturnType<typeof createUserWithToken>>;
  let admin: Actor;
  let member: Actor;
  let otherMember: Actor;
  let assigner: Actor;
  let customRoleId: string;
  const createdOwners: string[] = [];

  async function makeOwner(
    fields: Partial<Prisma.OwnerUncheckedCreateInput> = {},
  ): Promise<string> {
    const owner = await db.owner.create({
      data: { name: 'مالك اختبار T3', createdById: admin.id, ...fields },
    });
    createdOwners.push(owner.id);
    return owner.id;
  }

  /** An owner already in the trash since `deletedAt`. */
  const trashedOwner = (deletedAt: Date, name = 'Trashed owner') =>
    makeOwner({ name, deletedAt, deletedById: admin.id });

  beforeAll(async () => {
    db = createTestDb();
    const { adminRoleId, memberRoleId } = await ensureBuiltInRoles(db);
    const custom = await db.role.create({
      data: {
        name: `T3 assigner ${Date.now()}`,
        permissions: ['owners.assign'],
      },
    });
    customRoleId = custom.id;

    // The Admin token carries no keys: the built-in role alone must let it through.
    admin = await createUserWithToken(db, 't3-admin', adminRoleId, []);
    member = await createUserWithToken(db, 't3-member', memberRoleId, []);
    otherMember = await createUserWithToken(db, 't3-member2', memberRoleId, []);
    assigner = await createUserWithToken(db, 't3-assigner', customRoleId, [
      'owners.assign',
    ]);

    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
      controllers: [ProbeController],
      providers: [OwnerProbeRepository],
    }).compile();
    app = moduleRef.createNestApplication();
    configureApp(app);
    await app.init();

    clock = app.get(Clock);
    now = new Date(Math.floor(Date.now() / 1000) * 1000);
    jest.spyOn(clock, 'now').mockImplementation(() => new Date(now));
  });

  afterAll(async () => {
    const users = [admin, member, otherMember, assigner]
      .filter(Boolean)
      .map((u) => u.id);
    if (db) {
      await db.activityEntry.deleteMany({ where: { actorId: { in: users } } });
      await db.owner.deleteMany({ where: { id: { in: createdOwners } } });
      await db.user.deleteMany({ where: { id: { in: users } } });
      if (customRoleId) await db.role.delete({ where: { id: customRoleId } });
      await db.$disconnect();
    }
    await app?.close();
  });

  // ------------------------------------------------------------ permissions

  describe('permissions', () => {
    it("Endpoint with @RequirePermission('x') and a user without x → 403", async () => {
      for (const path of ['/api/activity', '/api/trash']) {
        const res = await http()
          .get(path)
          .set(bearer(member.token))
          .expect(403);
        expect(res.body).toMatchObject({ success: false, error: 'FORBIDDEN' });
      }
      await http()
        .get('/api/t3-probe/perm/data.export')
        .set(bearer(member.token))
        .expect(403);
    });

    it('Admin role always passes every permission check, even a permission added to the list later', async () => {
      for (const key of PROBE_KEYS) {
        await http()
          .get(`/api/t3-probe/perm/${key}`)
          .set(bearer(admin.token))
          .expect(200);
      }
      // A custom role holding every key known today still lacks the new one.
      const everyKey = await createUserWithToken(
        db,
        't3-everykey',
        customRoleId,
        [...PERMISSION_KEYS],
      );
      try {
        await http()
          .get(`/api/t3-probe/perm/${ADDED_LATER}`)
          .set(bearer(everyKey.token))
          .expect(403);
      } finally {
        await db.user.delete({ where: { id: everyKey.id } });
      }
    });

    it('Custom role with only owners.assign passes that check and is refused every other permission', async () => {
      for (const key of PROBE_KEYS) {
        await http()
          .get(`/api/t3-probe/perm/${key}`)
          .set(bearer(assigner.token))
          .expect(key === 'owners.assign' ? 200 : 403);
      }
      await http().get('/api/trash').set(bearer(assigner.token)).expect(403);
    });

    it('@GetUser() gives the typed caller, isAdmin from the built-in role', async () => {
      const res = await http()
        .get('/api/t3-probe/me')
        .set(bearer(admin.token))
        .expect(200);
      expect(res.body.data).toEqual({
        id: admin.id,
        roleId: admin.claims.roleId,
        permissions: [],
        isAdmin: true,
      });
      const mine = await http()
        .get('/api/t3-probe/me')
        .set(bearer(assigner.token))
        .expect(200);
      expect(mine.body.data).toMatchObject({
        permissions: ['owners.assign'],
        isAdmin: false,
      });
    });
  });

  // -------------------------------------------------------------- ownership

  describe('ownership', () => {
    it("Ownership helper: member asking for someone else's record → NotFound, not Forbidden", async () => {
      const theirs = await makeOwner({ assignedToId: otherMember.id });
      const unassigned = await makeOwner();
      for (const id of [theirs, unassigned]) {
        const res = await http()
          .get(`/api/t3-probe/owners/${id}`)
          .set(bearer(member.token))
          .expect(404);
        expect(res.body.error).toBe('NOT_FOUND');
      }
      await http()
        .get(`/api/t3-probe/owners/${theirs}`)
        .set(bearer(otherMember.token))
        .expect(200);
      await http()
        .get(`/api/t3-probe/owners/${unassigned}`)
        .set(bearer(admin.token))
        .expect(200);
    });
  });

  // --------------------------------------------------------------- activity

  describe('activity writer', () => {
    it('Activity writer inside a transaction rolls back with it', async () => {
      const activity = app.get(ActivityService);
      const database = app.get(DatabaseService);
      const summary = `rollback probe ${Date.now()}`;

      await expect(
        database.transaction(async (tx) => {
          await activity.record(tx, {
            type: 'SETTINGS_UPDATE',
            actorId: admin.id,
            summary,
          });
          throw new Error('the change failed after the log write');
        }),
      ).rejects.toThrow('the change failed');
      expect(await db.activityEntry.count({ where: { summary } })).toBe(0);

      await database.transaction((tx) =>
        activity.record(tx, {
          type: 'SETTINGS_UPDATE',
          actorId: admin.id,
          summary,
          details: { adCheckInDays: 7 },
        }),
      );
      expect(await db.activityEntry.count({ where: { summary } })).toBe(1);
    });
  });

  describe('GET /api/activity', () => {
    beforeAll(async () => {
      const activity = app.get(ActivityService);
      await app.get(DatabaseService).transaction(async (tx) => {
        await activity.record(tx, {
          type: 'EXPORT',
          actorId: member.id,
          summary: 'Exported owners',
          details: { rows: 12 },
        });
        await activity.record(tx, {
          type: 'ROLE_CREATE',
          actorId: member.id,
          summary: 'Created role Team lead',
          target: { kind: 'ROLE', id: customRoleId, label: 'Team lead' },
        });
      });
    });

    it('lists entries in the ActivityEntry shape, filtered by actor and type', async () => {
      const res = await http()
        .get(`/api/activity?actorId=${member.id}&type=ROLE_CREATE,EXPORT`)
        .set(bearer(admin.token))
        .expect(200);
      expect(res.body.meta).toMatchObject({ total: 2, page: 1, limit: 20 });
      expect(res.body.data[0]).toEqual({
        id: expect.any(String),
        type: 'ROLE_CREATE',
        actor: { id: member.id, name: member.name },
        summary: 'Created role Team lead',
        target: { kind: 'ROLE', id: customRoleId, label: 'Team lead' },
        details: null,
        createdAt: expect.any(String),
      });
      expect(res.body.data[1]).toMatchObject({
        type: 'EXPORT',
        target: null,
        details: { rows: 12 },
      });

      const onlyExport = await http()
        .get(`/api/activity?actorId=${member.id}&type=EXPORT`)
        .set(bearer(admin.token))
        .expect(200);
      expect(onlyExport.body.data.map((e: { type: string }) => e.type)).toEqual(
        ['EXPORT'],
      );
    });

    it('filters by Cairo date range, and a range in the past finds nothing', async () => {
      const today = new Intl.DateTimeFormat('en-CA', {
        timeZone: 'Africa/Cairo',
      }).format(new Date());
      const inRange = await http()
        .get(`/api/activity?actorId=${member.id}&from=${today}&to=${today}`)
        .set(bearer(admin.token))
        .expect(200);
      expect(inRange.body.meta.total).toBe(2);
      const past = await http()
        .get(`/api/activity?actorId=${member.id}&from=2020-01-01&to=2020-01-31`)
        .set(bearer(admin.token))
        .expect(200);
      expect(past.body).toMatchObject({ data: [], meta: { total: 0 } });
    });

    it('paginates: limit 1 gives one row and a next page; a page past the end is empty', async () => {
      const first = await http()
        .get(`/api/activity?actorId=${member.id}&limit=1`)
        .set(bearer(admin.token))
        .expect(200);
      expect(first.body.data).toHaveLength(1);
      expect(first.body.meta).toMatchObject({
        hasNextPage: true,
        hasPreviousPage: false,
      });
      const beyond = await http()
        .get(`/api/activity?actorId=${member.id}&page=50`)
        .set(bearer(admin.token))
        .expect(200);
      expect(beyond.body.data).toEqual([]);
      expect(beyond.body.meta).toMatchObject({ hasNextPage: false });
    });

    it.each([
      ['page=0'],
      ['page=-1'],
      ['limit=0'],
      ['limit=21'],
      ['limit=abc'],
      ['page=1.5'],
      ['type=NOPE'],
      ['type=EXPORT,NOPE'],
      ['actorId=not-a-uuid'],
      ['from=yesterday'],
      ['from=2026-02-30'],
      ['from=2026-W43'],
      ['to=2026-10-22T25:00:00Z'],
      ['from=2026-10-23&to=2026-10-22'],
      ['sort=createdAt'],
    ])('bad filter %s → 400', async (qs) => {
      const res = await http()
        .get(`/api/activity?${qs}`)
        .set(bearer(admin.token))
        .expect(400);
      expect(res.body.success).toBe(false);
    });
  });

  // ------------------------------------------------------------ soft delete

  describe('soft delete', () => {
    it('Soft-deleted rows excluded from every default query', async () => {
      const repo = app.get(OwnerProbeRepository);
      const area = `t3-area-${Date.now()}`;
      const live = await makeOwner({ area, assignedToId: member.id });
      const gone = await trashedOwner(now);
      await db.owner.update({
        where: { id: gone },
        data: { area, assignedToId: member.id },
      });

      expect(await repo.findById(gone)).toBeNull();
      expect(await repo.findFirst({ id: gone })).toBeNull();
      expect(await repo.count({ area })).toBe(1);
      const page = await repo.findAllWithPagination(1, 20, undefined, [], {
        area,
      });
      expect(page.data.map((o) => o.id)).toEqual([live]);
      await expect(repo.update(gone, { name: 'x' })).rejects.toMatchObject({
        code: 'P2025',
      });
      await expect(repo.findById(live)).resolves.toMatchObject({ id: live });

      // Over HTTP: the record's own member gets 404, like an id that never existed.
      const res = await http()
        .get(`/api/t3-probe/owners/${gone}`)
        .set(bearer(member.token))
        .expect(404);
      expect(res.body.error).toBe('NOT_FOUND');
    });
  });

  // ------------------------------------------------------------------ trash

  describe('trash', () => {
    const restore = (kind: string, id: string, token = admin.token) =>
      http().post(`/api/trash/${kind}/${id}/restore`).set(bearer(token));

    it('Trash core computes purgeAt = deletedAt + 30 days', async () => {
      const id = await makeOwner({ name: 'Soft delete me' });
      const result = await app
        .get(DatabaseService)
        .transaction((tx) =>
          app.get(TrashService).softDelete(tx, 'OWNER', id, admin.id),
        );
      expect(result.deletedAt).toEqual(now);
      expect(result.purgeAt.getTime()).toBe(now.getTime() + 30 * DAY);

      const res = await http()
        .get('/api/trash?kind=OWNER')
        .set(bearer(admin.token))
        .expect(200);
      const item = res.body.data.find((i: { id: string }) => i.id === id);
      expect(item).toEqual({
        kind: 'OWNER',
        id,
        label: 'Soft delete me',
        deletedBy: { id: admin.id, name: admin.name },
        deletedAt: now.toISOString(),
        purgeAt: new Date(now.getTime() + 30 * DAY).toISOString(),
      });
      const logged = await db.activityEntry.findFirst({
        where: { type: 'DELETE', targetId: id },
      });
      expect(logged).toMatchObject({
        actorId: admin.id,
        targetKind: 'OWNER',
        targetLabel: 'Soft delete me',
      });
    });

    it('a soft delete rolls back with its transaction (row and DELETE entry)', async () => {
      const id = await makeOwner();
      await expect(
        app.get(DatabaseService).transaction(async (tx) => {
          await app.get(TrashService).softDelete(tx, 'OWNER', id, admin.id);
          throw new Error('later step failed');
        }),
      ).rejects.toThrow('later step failed');
      expect(
        (await db.owner.findUnique({ where: { id } }))?.deletedAt,
      ).toBeNull();
      expect(await db.activityEntry.count({ where: { targetId: id } })).toBe(0);
    });

    it('Trash lists only items deleted < 30 days ago, newest first, across kinds', async () => {
      const recent = await trashedOwner(new Date(now.getTime() - DAY));
      const edge = await trashedOwner(new Date(now.getTime() - 30 * DAY));
      const expired = await trashedOwner(
        new Date(now.getTime() - 30 * DAY - MINUTE),
      );
      const all: { id: string; kind: string }[] = [];
      for (let page = 1; ; page++) {
        const res = await http()
          .get(`/api/trash?page=${page}`)
          .set(bearer(admin.token))
          .expect(200);
        all.push(...res.body.data);
        if (!res.body.meta.hasNextPage) break;
      }
      const ids = all.map((i) => i.id);
      expect(ids).toEqual(expect.arrayContaining([recent, edge]));
      expect(ids).not.toContain(expired);
      expect(ids.indexOf(recent)).toBeLessThan(ids.indexOf(edge));
    });

    it('Restore after purgeAt → 410 PURGED', async () => {
      const id = await trashedOwner(new Date(now.getTime() - 31 * DAY));
      const res = await restore('OWNER', id).expect(410);
      expect(res.body).toMatchObject({ success: false, error: 'PURGED' });
      expect(
        (await db.owner.findUnique({ where: { id } }))?.deletedAt,
      ).not.toBe(null);
    });

    it('Item deleted exactly 30 days ago is still restorable; 30 days + 1 minute is not', async () => {
      const exactly = await trashedOwner(new Date(now.getTime() - 30 * DAY));
      const late = await trashedOwner(
        new Date(now.getTime() - 30 * DAY - MINUTE),
      );
      await restore('owner', exactly).expect(200);
      await restore('OWNER', late).expect(410);
    });

    it('restores the record and logs RESTORE', async () => {
      const id = await trashedOwner(
        new Date(now.getTime() - DAY),
        'Bring me back',
      );
      const res = await restore('OWNER', id).expect(200);
      expect(res.body).toMatchObject({ success: true, data: null });
      expect(await db.owner.findUnique({ where: { id } })).toMatchObject({
        deletedAt: null,
        deletedById: null,
      });
      expect(
        await db.activityEntry.findFirst({
          where: { type: 'RESTORE', targetId: id },
        }),
      ).toMatchObject({
        actorId: admin.id,
        summary: 'Restored owner Bring me back',
      });
      // Restoring it again: it is no longer in the trash.
      await restore('OWNER', id).expect(404);
    });

    it("Restore an item that isn't in the trash → 404; member calls restore → 403", async () => {
      const live = await makeOwner();
      const res = await restore('OWNER', live).expect(404);
      expect(res.body.error).toBe('NOT_FOUND');
      await restore('OWNER', '00000000-0000-4000-8000-000000000000').expect(
        404,
      );
      await restore('LISTING', live).expect(404);

      const trashed = await trashedOwner(new Date(now.getTime() - DAY));
      await restore('OWNER', trashed, member.token).expect(403);
      await restore('OWNER', trashed, assigner.token).expect(403);
      expect(
        (await db.owner.findUnique({ where: { id: trashed } }))?.deletedAt,
      ).not.toBeNull();
    });

    it('a purged row (DELETE logged, row gone) → 410 PURGED', async () => {
      const id = await makeOwner({ name: 'Purge me' });
      await app
        .get(DatabaseService)
        .transaction((tx) =>
          app.get(TrashService).softDelete(tx, 'OWNER', id, admin.id),
        );
      await db.owner.delete({ where: { id } });
      const res = await restore('OWNER', id).expect(410);
      expect(res.body.error).toBe('PURGED');
    });

    it.each([
      ['GET', '/api/trash?kind=BOGUS'],
      ['GET', '/api/trash?page=0'],
      ['GET', '/api/trash?limit=21'],
      ['GET', '/api/trash?limit=x'],
      ['GET', '/api/trash?extra=1'],
      ['POST', '/api/trash/BOGUS/00000000-0000-4000-8000-000000000000/restore'],
      ['POST', '/api/trash/OWNER/not-a-uuid/restore'],
    ])('bad input %s %s → 400', async (method, path) => {
      const req = method === 'GET' ? http().get(path) : http().post(path);
      const res = await req.set(bearer(admin.token)).expect(400);
      expect(res.body.success).toBe(false);
    });
  });

  // ------------------------------------------------------------ auth boundary

  describe('auth boundary', () => {
    const routes: [string, string][] = [
      ['GET', '/api/activity'],
      ['GET', '/api/trash'],
      ['POST', '/api/trash/OWNER/00000000-0000-4000-8000-000000000000/restore'],
    ];

    it.each(routes)('%s %s with no token → 401', async (method, path) => {
      const res = await (
        method === 'GET' ? http().get(path) : http().post(path)
      ).expect(401);
      expect(res.body).toMatchObject({ success: false, error: 'UNAUTHORIZED' });
    });

    it.each(routes)(
      '%s %s with an expired or forged token → 401',
      async (method, path) => {
        const call = () =>
          method === 'GET' ? http().get(path) : http().post(path);
        await call()
          .set(bearer(signExpiredToken(admin.claims)))
          .expect(401);
        await call()
          .set(bearer(`${admin.token.slice(0, -4)}AAAA`))
          .expect(401);
      },
    );
  });
});
