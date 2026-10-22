import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import type { PrismaClient } from '@prisma/client';
import { PERMISSION_KEYS, PERMISSIONS } from '@prime-crm/shared';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { configureApp } from '../src/app.setup';
import { createTestDb, randomPassword, uniqueEmail } from './helpers';
import {
  bearer,
  createUserWithToken,
  ensureBuiltInRoles,
  signExpiredToken,
} from './helpers-auth';

/**
 * T5 — users and roles. Each edge case from the plan (T5 section) is an `it` named after it,
 * plus the generic checklist. Fixtures are created directly; tokens are signed for them.
 */

type Fixture = Awaited<ReturnType<typeof createUserWithToken>>;
const MISSING = '00000000-0000-4000-8000-000000000000';

describe('Users and roles (e2e)', () => {
  let app: INestApplication;
  let db: PrismaClient;
  let adminRoleId: string;
  let memberRoleId: string;
  let admin: Fixture;
  let member: Fixture;
  let manager: Fixture; // custom role with users.manage only
  let assigner: Fixture; // custom role with owners.assign only
  let managerRoleId: string;
  let assignerRoleId: string;
  const userIds: string[] = [];
  const roleIds: string[] = [];
  const ownerIds: string[] = [];
  const http = () => request(app.getHttpServer());

  async function customRole(name: string, permissions: string[]) {
    const role = await db.role.create({
      data: { name: `${name} ${Date.now()}-${roleIds.length}`, permissions },
    });
    roleIds.push(role.id);
    return role.id;
  }

  async function fixture(label: string, roleId: string, permissions: string[]) {
    const user = await createUserWithToken(
      db,
      `t5-${label}`,
      roleId,
      permissions,
    );
    userIds.push(user.id);
    return user;
  }

  /** Creates a user through the API; returns its id and password. */
  async function apiCreateUser(fields: Record<string, unknown> = {}) {
    const password = randomPassword();
    const res = await http()
      .post('/api/users')
      .set(bearer(admin.token))
      .send({
        name: 'E2E user',
        email: uniqueEmail('t5-api'),
        roleId: memberRoleId,
        language: 'en',
        password,
        ...fields,
      })
      .expect(201);
    userIds.push(res.body.data.id);
    return { ...res.body.data, password } as {
      id: string;
      email: string;
      name: string;
      phone: string | null;
      password: string;
    };
  }

  /**
   * Makes `keep` the only active admins for the duration of `work` (other admins in this
   * database are deactivated, then restored).
   */
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

  const tokenClaims = (token: string) =>
    JSON.parse(Buffer.from(token.split('.')[1], 'base64url').toString()) as {
      permissions: string[];
    };

  beforeAll(async () => {
    db = createTestDb();
    ({ adminRoleId, memberRoleId } = await ensureBuiltInRoles(db));
    managerRoleId = await customRole('T5 managers', ['users.manage']);
    assignerRoleId = await customRole('T5 assigners', ['owners.assign']);

    admin = await fixture('admin', adminRoleId, [...PERMISSION_KEYS]);
    member = await fixture('member', memberRoleId, []);
    manager = await fixture('manager', managerRoleId, ['users.manage']);
    assigner = await fixture('assigner', assignerRoleId, ['owners.assign']);

    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = moduleRef.createNestApplication();
    configureApp(app);
    await app.init();
  });

  afterAll(async () => {
    if (db) {
      const apiUsers = await db.user.findMany({
        where: { email: { startsWith: 't5-' } },
        select: { id: true },
      });
      const ids = [...new Set([...userIds, ...apiUsers.map((u) => u.id)])];
      await db.reminder.deleteMany({ where: { memberId: { in: ids } } });
      await db.listing.deleteMany({ where: { assignedToId: { in: ids } } });
      await db.owner.deleteMany({ where: { id: { in: ownerIds } } });
      await db.activityEntry.deleteMany({ where: { actorId: { in: ids } } });
      await db.user.deleteMany({ where: { id: { in: ids } } });
      await db.role.deleteMany({ where: { id: { in: roleIds } } });
      // Roles created through the API by these tests.
      await db.role.deleteMany({ where: { name: { startsWith: 'T5 ' } } });
      // Built-in names back to the seed's, in case a rename test failed half-way.
      await db.role.update({
        where: { id: memberRoleId },
        data: { name: 'Team member' },
      });
      await db.$disconnect();
    }
    await app?.close();
  });

  // ------------------------------------------------------------------ access

  describe('access', () => {
    it('Member without users.manage calls any /users endpoint → 403', async () => {
      const target = admin.id;
      const calls = [
        () => http().get('/api/users'),
        () => http().get('/api/users/options'),
        () => http().post('/api/users').send({}),
        () => http().get(`/api/users/${target}`),
        () => http().patch(`/api/users/${target}`).send({ name: 'x' }),
        () =>
          http()
            .post(`/api/users/${target}/reset-password`)
            .send({ newPassword: 'whatever-123' }),
      ];
      for (const call of calls) {
        const res = await call().set(bearer(member.token)).expect(403);
        expect(res.body).toMatchObject({ success: false, error: 'FORBIDDEN' });
      }
      // The assigner may use the picker only.
      await http()
        .get('/api/users/options')
        .set(bearer(assigner.token))
        .expect(200);
      await http().get('/api/users').set(bearer(assigner.token)).expect(403);
      await http()
        .get(`/api/users/${target}`)
        .set(bearer(assigner.token))
        .expect(403);
    });

    it('Member calls /roles and /roles/permissions → 403', async () => {
      const calls = [
        () => http().get('/api/roles'),
        () => http().get('/api/roles/permissions'),
        () => http().post('/api/roles').send({ name: 'T5 x', permissions: [] }),
        () =>
          http().patch(`/api/roles/${assignerRoleId}`).send({ name: 'T5 y' }),
        () => http().delete(`/api/roles/${assignerRoleId}`),
      ];
      for (const call of calls) {
        const res = await call().set(bearer(member.token)).expect(403);
        expect(res.body.error).toBe('FORBIDDEN');
      }
      // users.manage alone opens the roles picker, nothing else on /roles.
      await http().get('/api/roles').set(bearer(manager.token)).expect(200);
      await http()
        .get('/api/roles/permissions')
        .set(bearer(manager.token))
        .expect(403);
      await http()
        .post('/api/roles')
        .set(bearer(manager.token))
        .send({ name: 'T5 nope', permissions: [] })
        .expect(403);
      // A member is refused before the query is validated.
      await http()
        .get('/api/roles?limit=500')
        .set(bearer(member.token))
        .expect(403);
    });

    it('no token, expired token or forged token → 401', async () => {
      for (const path of [
        '/api/users',
        '/api/users/options',
        '/api/roles',
        '/api/roles/permissions',
      ]) {
        await http().get(path).expect(401);
        await http()
          .get(path)
          .set(bearer(signExpiredToken(admin.claims)))
          .expect(401);
        await http()
          .get(path)
          .set(bearer(`${admin.token.slice(0, -4)}AAAA`))
          .expect(401);
      }
    });

    it('a user with users.manage (not admin) manages users', async () => {
      const user = await apiCreateUser();
      await http()
        .patch(`/api/users/${user.id}`)
        .set(bearer(manager.token))
        .send({ name: 'Renamed by manager' })
        .expect(200);
    });
  });

  // ------------------------------------------------------------------- users

  describe('POST /users', () => {
    it('creates a user: Arabic name trimmed, phone normalised, email lower-cased, no hash', async () => {
      const email = uniqueEmail('t5-Create').toUpperCase();
      const password = randomPassword();
      const res = await http()
        .post('/api/users')
        .set(bearer(admin.token))
        .send({
          name: '  سارة محمود ',
          email: `  ${email} `,
          phone: '0100 123 4567',
          roleId: memberRoleId,
          language: 'ar',
          password,
        })
        .expect(201);
      userIds.push(res.body.data.id);
      expect(res.body.data).toEqual({
        id: expect.any(String),
        name: 'سارة محمود',
        email: email.toLowerCase(),
        phone: '+201001234567',
        language: 'ar',
        active: true,
        role: { id: memberRoleId, name: expect.any(String) },
        createdAt: expect.any(String),
      });
      expect(JSON.stringify(res.body)).not.toMatch(/passwordHash|scrypt/);

      // The new user signs in with that password.
      await http()
        .post('/api/auth/login')
        .send({ email, password })
        .expect(200);
    });

    it('Create user with an existing email (different case) → 409 EMAIL_TAKEN', async () => {
      const user = await apiCreateUser();
      const res = await http()
        .post('/api/users')
        .set(bearer(admin.token))
        .send({
          name: 'Dup',
          email: `  ${user.email.toUpperCase()}`,
          roleId: memberRoleId,
          language: 'en',
          password: randomPassword(),
        })
        .expect(409);
      expect(res.body).toMatchObject({ success: false, error: 'EMAIL_TAKEN' });
      expect(await db.user.count({ where: { email: user.email } })).toBe(1);
    });

    it('phone: 11 digits starting 01 in any spelling is stored as E.164; others → 400', async () => {
      for (const phone of [
        '01001234567',
        '+20 100 123 4567',
        '0020-100-123-4567',
        '(010) 0123 4567',
      ]) {
        const user = await apiCreateUser({ phone });
        expect(user.phone).toBe('+201001234567');
      }
      for (const phone of [
        '0100123456',
        '010012345678',
        '01301234567',
        'call me',
        '',
      ]) {
        const res = await http()
          .post('/api/users')
          .set(bearer(admin.token))
          .send({
            name: 'Bad phone',
            email: uniqueEmail('t5-phone'),
            phone,
            roleId: memberRoleId,
            language: 'en',
            password: randomPassword(),
          })
          .expect(400);
        expect(res.body.error).toBe('VALIDATION_FAILED');
      }
    });

    it('validation: missing, empty, wrong-type and extra fields → 400', async () => {
      const valid = {
        name: 'Valid',
        email: uniqueEmail('t5-valid'),
        roleId: memberRoleId,
        language: 'en',
        password: randomPassword(),
      };
      const bodies: Record<string, unknown>[] = [
        {},
        { ...valid, name: undefined },
        { ...valid, name: '   ' },
        { ...valid, name: 'n'.repeat(101) },
        { ...valid, email: 'not-an-email' },
        { ...valid, roleId: 'admin' },
        { ...valid, roleId: undefined },
        { ...valid, language: 'fr' },
        { ...valid, password: '1234567' },
        { ...valid, password: 12345678 },
        { ...valid, active: false },
        { ...valid, passwordHash: 'x' },
      ];
      for (const body of bodies) {
        const res = await http()
          .post('/api/users')
          .set(bearer(admin.token))
          .send(body)
          .expect(400);
        expect(res.body.error).toBe('VALIDATION_FAILED');
      }
    });

    it('an unknown roleId → 400 INVALID_ROLE', async () => {
      const res = await http()
        .post('/api/users')
        .set(bearer(admin.token))
        .send({
          name: 'No role',
          email: uniqueEmail('t5-norole'),
          roleId: MISSING,
          language: 'en',
          password: randomPassword(),
        })
        .expect(400);
      expect(res.body.error).toBe('INVALID_ROLE');
    });
  });

  describe('GET /users', () => {
    let searchRoleId: string;

    beforeAll(async () => {
      searchRoleId = await customRole('T5 search', []);
      for (const name of [
        '100% Ahmed',
        'Ahmed_Ali',
        'O\'Brien "Quote"',
        'Plain Ahmed',
        'محمد عبد الله',
      ]) {
        await apiCreateUser({ name, roleId: searchRoleId });
      }
      await apiCreateUser({
        name: 'Phone Person',
        roleId: searchRoleId,
        phone: '0122 333 4444',
      });
    });

    const search = async (query: Record<string, string>) => {
      const res = await http()
        .get('/api/users')
        .query({ roleId: searchRoleId, ...query })
        .set(bearer(admin.token))
        .expect(200);
      return res.body;
    };
    const names = (body: { data: { name: string }[] }) =>
      body.data.map((u) => u.name);

    it('search with %, _ and quotes matches them literally', async () => {
      expect(names(await search({ q: '%' }))).toEqual(['100% Ahmed']);
      expect(names(await search({ q: '_' }))).toEqual(['Ahmed_Ali']);
      expect(names(await search({ q: "'" }))).toEqual(['O\'Brien "Quote"']);
      expect(names(await search({ q: '"' }))).toEqual(['O\'Brien "Quote"']);
      expect(names(await search({ q: 'ahmed' }))).toEqual([
        '100% Ahmed',
        'Ahmed_Ali',
        'Plain Ahmed',
      ]);
      expect(names(await search({ q: 'nobody-matches-this' }))).toEqual([]);
    });

    it('search finds Arabic names, emails and a phone typed any way', async () => {
      expect(names(await search({ q: 'عبد' }))).toEqual(['محمد عبد الله']);
      expect(names(await search({ q: '01223334444' }))).toEqual([
        'Phone Person',
      ]);
      expect(names(await search({ q: '+20 122 333 4444' }))).toEqual([
        'Phone Person',
      ]);
      const all = await search({});
      expect(all.meta.total).toBe(6);
    });

    it('filters by role and active', async () => {
      const users = await search({});
      const one = users.data[0].id as string;
      await db.user.update({ where: { id: one }, data: { active: false } });
      expect(
        (await search({ active: 'false' })).data.map(
          (u: { id: string }) => u.id,
        ),
      ).toEqual([one]);
      expect((await search({ active: 'true' })).meta.total).toBe(5);
      await db.user.update({ where: { id: one }, data: { active: true } });
    });

    it('pagination: limit 1 pages, past the end is empty, out-of-range → 400', async () => {
      const first = await search({ limit: '1' });
      expect(first.data).toHaveLength(1);
      expect(first.meta).toEqual({
        total: 6,
        page: 1,
        limit: 1,
        hasNextPage: true,
        hasPreviousPage: false,
      });
      const past = await search({ page: '99' });
      expect(past.data).toEqual([]);
      expect(past.meta.hasPreviousPage).toBe(true);
      for (const query of [
        { page: '0' },
        { page: '-1' },
        { page: '1.5' },
        { limit: '0' },
        { limit: '21' },
        { limit: 'abc' },
        { active: 'yes' },
        { roleId: 'x' },
        { q: 'x'.repeat(101) },
        { sort: 'name' },
      ]) {
        await http()
          .get('/api/users')
          .query(query)
          .set(bearer(admin.token))
          .expect(400);
      }
    });
  });

  describe('GET /users/options', () => {
    it('active users by default as { id, name }, deactivated with active=false, limit up to 100', async () => {
      const inactive = await apiCreateUser({ name: 'T5 Inactive Option' });
      await db.user.update({
        where: { id: inactive.id },
        data: { active: false },
      });

      const active = await http()
        .get('/api/users/options?limit=100')
        .set(bearer(assigner.token))
        .expect(200);
      expect(active.body.meta.limit).toBe(100);
      expect(Object.keys(active.body.data[0]).sort()).toEqual(['id', 'name']);
      const activeIds = active.body.data.map((u: { id: string }) => u.id);
      expect(activeIds).not.toContain(inactive.id);

      const off = await http()
        .get('/api/users/options?active=false&limit=100')
        .set(bearer(admin.token))
        .expect(200);
      expect(off.body.data.map((u: { id: string }) => u.id)).toContain(
        inactive.id,
      );

      await http()
        .get('/api/users/options?limit=101')
        .set(bearer(admin.token))
        .expect(400);
      await http()
        .get('/api/users/options?page=0')
        .set(bearer(admin.token))
        .expect(400);
    });
  });

  describe('GET /users/:id', () => {
    it('returns the user with counts of live owners, live listings and open reminders', async () => {
      const user = await apiCreateUser({ name: 'Counted' });
      const owner = await db.owner.create({
        data: {
          name: 'T5 owner',
          assignedToId: user.id,
          createdById: admin.id,
        },
      });
      const trashed = await db.owner.create({
        data: {
          name: 'T5 trashed owner',
          assignedToId: user.id,
          createdById: admin.id,
          deletedAt: new Date(),
          deletedById: admin.id,
        },
      });
      ownerIds.push(owner.id, trashed.id);
      await db.listing.create({
        data: {
          purpose: 'SALE',
          type: 'APARTMENT',
          area: 'New Cairo',
          sizeSqm: 120,
          price: 3_000_000,
          ownerName: 'T5 owner',
          ownerPhone: `+2010${String(Date.now()).slice(-8)}`,
          assignedToId: user.id,
          createdById: admin.id,
        },
      });
      await db.reminder.create({
        data: { ownerId: owner.id, memberId: user.id, dueAt: new Date() },
      });
      await db.reminder.create({
        data: {
          ownerId: owner.id,
          memberId: user.id,
          dueAt: new Date(),
          doneAt: new Date(),
        },
      });

      const res = await http()
        .get(`/api/users/${user.id}`)
        .set(bearer(admin.token))
        .expect(200);
      expect(res.body.data).toMatchObject({
        id: user.id,
        name: 'Counted',
        counts: { owners: 1, listings: 1, openReminders: 1 },
      });
      expect(JSON.stringify(res.body)).not.toMatch(/passwordHash/);
    });

    it('unknown id → 404, malformed id → 400', async () => {
      const res = await http()
        .get(`/api/users/${MISSING}`)
        .set(bearer(admin.token))
        .expect(404);
      expect(res.body.error).toBe('NOT_FOUND');
      await http()
        .get('/api/users/not-a-uuid')
        .set(bearer(admin.token))
        .expect(400);
    });
  });

  describe('PATCH /users/:id', () => {
    it('changes name, email, phone, language and role; phone null clears it', async () => {
      const user = await apiCreateUser({ phone: '01001112222' });
      const res = await http()
        .patch(`/api/users/${user.id}`)
        .set(bearer(admin.token))
        .send({
          name: ' عمر ',
          email: uniqueEmail('T5-Changed'),
          language: 'ar',
          roleId: assignerRoleId,
        })
        .expect(200);
      expect(res.body.data).toMatchObject({
        name: 'عمر',
        language: 'ar',
        phone: '+201001112222',
        role: { id: assignerRoleId },
      });
      expect(res.body.data.email).toMatch(/^t5-changed-/);

      const cleared = await http()
        .patch(`/api/users/${user.id}`)
        .set(bearer(admin.token))
        .send({ phone: null })
        .expect(200);
      expect(cleared.body.data.phone).toBeNull();
    });

    it('email of another user (any case) → 409 EMAIL_TAKEN; own email is fine', async () => {
      const a = await apiCreateUser();
      const b = await apiCreateUser();
      const res = await http()
        .patch(`/api/users/${b.id}`)
        .set(bearer(admin.token))
        .send({ email: a.email.toUpperCase() })
        .expect(409);
      expect(res.body.error).toBe('EMAIL_TAKEN');
      await http()
        .patch(`/api/users/${b.id}`)
        .set(bearer(admin.token))
        .send({ email: b.email.toUpperCase() })
        .expect(200);
    });

    it('cannot change active or password; null, bad role and bad values → 400; unknown id → 404', async () => {
      const user = await apiCreateUser();
      for (const body of [
        { active: false },
        { password: 'new-password-1' },
        { name: null },
        { email: null },
        { roleId: null },
        { language: 'fr' },
        { phone: '123' },
      ]) {
        await http()
          .patch(`/api/users/${user.id}`)
          .set(bearer(admin.token))
          .send(body)
          .expect(400);
      }
      const bad = await http()
        .patch(`/api/users/${user.id}`)
        .set(bearer(admin.token))
        .send({ roleId: MISSING })
        .expect(400);
      expect(bad.body.error).toBe('INVALID_ROLE');
      await http()
        .patch(`/api/users/${MISSING}`)
        .set(bearer(admin.token))
        .send({ name: 'x' })
        .expect(404);
    });

    it('Moving the last active admin to another role → 409 LAST_ADMIN', async () => {
      const solo = await fixture('solo-admin', adminRoleId, [
        ...PERMISSION_KEYS,
      ]);
      await onlyAdmins([solo.id], async () => {
        const res = await http()
          .patch(`/api/users/${solo.id}`)
          .set(bearer(manager.token))
          .send({ roleId: memberRoleId })
          .expect(409);
        expect(res.body).toMatchObject({ success: false, error: 'LAST_ADMIN' });
        // Also when the admin demotes themself.
        await http()
          .patch(`/api/users/${solo.id}`)
          .set(bearer(solo.token))
          .send({ roleId: memberRoleId })
          .expect(409);
        const row = await db.user.findUniqueOrThrow({ where: { id: solo.id } });
        expect(row.roleId).toBe(adminRoleId);

        // With a second active admin the move is allowed.
        const second = await fixture('second-admin', adminRoleId, [
          ...PERMISSION_KEYS,
        ]);
        await http()
          .patch(`/api/users/${solo.id}`)
          .set(bearer(manager.token))
          .send({ roleId: memberRoleId })
          .expect(200);
        // ...and now `second` is the last one.
        await http()
          .patch(`/api/users/${second.id}`)
          .set(bearer(manager.token))
          .send({ roleId: memberRoleId })
          .expect(409);
      });
    });

    it('Two admins demote each other concurrently → at least one admin remains', async () => {
      for (let round = 0; round < 3; round++) {
        const a = await fixture(`race-a${round}`, adminRoleId, [
          ...PERMISSION_KEYS,
        ]);
        const b = await fixture(`race-b${round}`, adminRoleId, [
          ...PERMISSION_KEYS,
        ]);
        await onlyAdmins([a.id, b.id], async () => {
          const [ab, ba] = await Promise.all([
            http()
              .patch(`/api/users/${b.id}`)
              .set(bearer(a.token))
              .send({ roleId: memberRoleId }),
            http()
              .patch(`/api/users/${a.id}`)
              .set(bearer(b.token))
              .send({ roleId: memberRoleId }),
          ]);
          expect([ab.status, ba.status].sort()).toEqual([200, 409]);
          expect([ab.body.error, ba.body.error]).toContain('LAST_ADMIN');
          const admins = await db.user.count({
            where: { roleId: adminRoleId, active: true },
          });
          expect(admins).toBe(1);
        });
      }
    });
  });

  describe('POST /users/:id/reset-password', () => {
    it('sets the new password and ends every session of that user', async () => {
      const user = await apiCreateUser();
      const login = await http()
        .post('/api/auth/login')
        .send({ email: user.email, password: user.password })
        .expect(200);
      const newPassword = randomPassword();
      const res = await http()
        .post(`/api/users/${user.id}/reset-password`)
        .set(bearer(admin.token))
        .send({ newPassword })
        .expect(200);
      expect(res.body.data).toBeNull();

      const refresh = await http()
        .post('/api/auth/refresh')
        .send({ refreshToken: login.body.data.refreshToken })
        .expect(401);
      expect(refresh.body.error).toBe('INVALID_REFRESH');
      await http()
        .post('/api/auth/login')
        .send({ email: user.email, password: user.password })
        .expect(401);
      await http()
        .post('/api/auth/login')
        .send({ email: user.email, password: newPassword })
        .expect(200);
    });

    it('short, missing or extra fields → 400; unknown user → 404', async () => {
      const user = await apiCreateUser();
      for (const body of [
        {},
        { newPassword: '1234567' },
        { newPassword: 'long-enough-1', x: 1 },
      ]) {
        await http()
          .post(`/api/users/${user.id}/reset-password`)
          .set(bearer(admin.token))
          .send(body)
          .expect(400);
      }
      await http()
        .post(`/api/users/${MISSING}/reset-password`)
        .set(bearer(admin.token))
        .send({ newPassword: 'long-enough-1' })
        .expect(404);
    });
  });

  // ------------------------------------------------------------------- roles

  describe('roles', () => {
    it('GET /roles/permissions is the fixed list with English and Arabic labels', async () => {
      const res = await http()
        .get('/api/roles/permissions')
        .set(bearer(admin.token))
        .expect(200);
      expect(res.body.data).toEqual(
        PERMISSIONS.map(({ key, labelEn, labelAr }) => ({
          key,
          labelEn,
          labelAr,
        })),
      );
    });

    it('GET /roles lists built-in roles first with user counts; Admin holds every key', async () => {
      const res = await http()
        .get('/api/roles?limit=100')
        .set(bearer(admin.token))
        .expect(200);
      const roles = res.body.data as {
        id: string;
        builtIn: string | null;
        permissions: string[];
        userCount: number;
      }[];
      expect(roles[0]).toMatchObject({
        id: adminRoleId,
        builtIn: 'ADMIN',
        permissions: [...PERMISSION_KEYS],
      });
      expect(roles[1]).toMatchObject({
        id: memberRoleId,
        builtIn: 'TEAM_MEMBER',
      });
      const manage = roles.find((r) => r.id === managerRoleId);
      expect(manage).toMatchObject({
        builtIn: null,
        permissions: ['users.manage'],
        userCount: 1,
      });
      await http()
        .get('/api/roles?limit=101')
        .set(bearer(admin.token))
        .expect(400);
      await http()
        .get('/api/roles?page=0')
        .set(bearer(admin.token))
        .expect(400);
      const past = await http()
        .get('/api/roles?page=999')
        .set(bearer(admin.token))
        .expect(200);
      expect(past.body.data).toEqual([]);
    });

    it('POST /roles creates a role (keys deduped, list order); a taken name → 409', async () => {
      const name = `T5 Team lead ${Date.now()}`;
      const res = await http()
        .post('/api/roles')
        .set(bearer(admin.token))
        .send({
          name: `  ${name} `,
          permissions: ['analytics.view', 'owners.assign', 'analytics.view'],
        })
        .expect(201);
      expect(res.body.data).toEqual({
        id: expect.any(String),
        name,
        builtIn: null,
        permissions: ['owners.assign', 'analytics.view'],
        userCount: 0,
      });
      const dup = await http()
        .post('/api/roles')
        .set(bearer(admin.token))
        .send({ name: name.toUpperCase(), permissions: [] })
        .expect(409);
      expect(dup.body.error).toBe('ROLE_NAME_TAKEN');
      const arabic = await http()
        .post('/api/roles')
        .set(bearer(admin.token))
        .send({ name: `T5 قائد ${Date.now()}`, permissions: [] })
        .expect(201);
      expect(arabic.body.data.name).toMatch(/قائد/);
    });

    it('Create role with an unknown permission key → 400', async () => {
      for (const body of [
        { name: 'T5 bad', permissions: ['owners.fly'] },
        { name: 'T5 bad', permissions: 'owners.assign' },
        { name: 'T5 bad' },
        { name: '', permissions: [] },
        { name: 'T5 ' + 'n'.repeat(60), permissions: [] },
        { name: 'T5 bad', permissions: [], builtIn: 'ADMIN' },
      ]) {
        const res = await http()
          .post('/api/roles')
          .set(bearer(admin.token))
          .send(body)
          .expect(400);
        expect(res.body.error).toBe('VALIDATION_FAILED');
      }
      expect(await db.role.count({ where: { name: 'T5 bad' } })).toBe(0);
    });

    it("Editing Admin role's permissions → 400 BUILT_IN_ROLE; renaming Team member allowed", async () => {
      const res = await http()
        .patch(`/api/roles/${adminRoleId}`)
        .set(bearer(admin.token))
        .send({ permissions: ['users.manage'] })
        .expect(400);
      expect(res.body.error).toBe('BUILT_IN_ROLE');
      const adminRole = await db.role.findUniqueOrThrow({
        where: { id: adminRoleId },
      });
      expect(adminRole.permissions).toEqual([...PERMISSION_KEYS]);

      const renamed = await http()
        .patch(`/api/roles/${memberRoleId}`)
        .set(bearer(admin.token))
        .send({ name: 'Agent' })
        .expect(200);
      expect(renamed.body.data).toMatchObject({
        id: memberRoleId,
        name: 'Agent',
        builtIn: 'TEAM_MEMBER',
      });
      await http()
        .patch(`/api/roles/${memberRoleId}`)
        .set(bearer(admin.token))
        .send({ name: 'Team member' })
        .expect(200);

      // Team member's permissions can be edited (and put back).
      await http()
        .patch(`/api/roles/${memberRoleId}`)
        .set(bearer(admin.token))
        .send({ permissions: ['analytics.view'] })
        .expect(200);
      await http()
        .patch(`/api/roles/${memberRoleId}`)
        .set(bearer(admin.token))
        .send({ permissions: [] })
        .expect(200);
    });

    it('PATCH /roles: taken name → 409, bad body → 400, unknown → 404, malformed id → 400', async () => {
      const other = await customRole('T5 other', []);
      const self = await customRole('T5 self', []);
      const otherName = (
        await db.role.findUniqueOrThrow({ where: { id: other } })
      ).name;
      const taken = await http()
        .patch(`/api/roles/${self}`)
        .set(bearer(admin.token))
        .send({ name: otherName.toLowerCase() })
        .expect(409);
      expect(taken.body.error).toBe('ROLE_NAME_TAKEN');
      for (const body of [
        { permissions: ['x'] },
        { name: null },
        { userCount: 1 },
      ]) {
        await http()
          .patch(`/api/roles/${self}`)
          .set(bearer(admin.token))
          .send(body)
          .expect(400);
      }
      await http()
        .patch(`/api/roles/${MISSING}`)
        .set(bearer(admin.token))
        .send({ name: 'T5 z' })
        .expect(404);
      await http()
        .patch('/api/roles/abc')
        .set(bearer(admin.token))
        .send({ name: 'T5 z' })
        .expect(400);
    });

    it('Delete a built-in role → 400; delete a role with users → 409 ROLE_IN_USE', async () => {
      for (const id of [adminRoleId, memberRoleId]) {
        const res = await http()
          .delete(`/api/roles/${id}`)
          .set(bearer(admin.token))
          .expect(400);
        expect(res.body.error).toBe('BUILT_IN_ROLE');
      }
      const inUse = await http()
        .delete(`/api/roles/${managerRoleId}`)
        .set(bearer(admin.token))
        .expect(409);
      expect(inUse.body.error).toBe('ROLE_IN_USE');
      // A deactivated user still holds the role.
      const roleId = await customRole('T5 dormant', []);
      const dormant = await fixture('dormant', roleId, []);
      await db.user.update({
        where: { id: dormant.id },
        data: { active: false },
      });
      await http()
        .delete(`/api/roles/${roleId}`)
        .set(bearer(admin.token))
        .expect(409);

      const unused = await customRole('T5 unused', []);
      const ok = await http()
        .delete(`/api/roles/${unused}`)
        .set(bearer(admin.token))
        .expect(200);
      expect(ok.body.data).toBeNull();
      expect(await db.role.findUnique({ where: { id: unused } })).toBeNull();
      await http()
        .delete(`/api/roles/${unused}`)
        .set(bearer(admin.token))
        .expect(404);
    });

    it('Permission change reflected in the next access token', async () => {
      const roleId = await customRole('T5 token', ['owners.assign']);
      const user = await apiCreateUser({ roleId });
      const login = await http()
        .post('/api/auth/login')
        .send({ email: user.email, password: user.password })
        .expect(200);
      expect(tokenClaims(login.body.data.accessToken).permissions).toEqual([
        'owners.assign',
      ]);
      // The current token can't read the activity log yet.
      await http()
        .get('/api/activity')
        .set(bearer(login.body.data.accessToken))
        .expect(403);

      await http()
        .patch(`/api/roles/${roleId}`)
        .set(bearer(admin.token))
        .send({ permissions: ['owners.assign', 'activity.view'] })
        .expect(200);

      const refreshed = await http()
        .post('/api/auth/refresh')
        .send({ refreshToken: login.body.data.refreshToken })
        .expect(200);
      const next = refreshed.body.data.accessToken as string;
      expect(tokenClaims(next).permissions).toEqual([
        'owners.assign',
        'activity.view',
      ]);
      await http().get('/api/activity').set(bearer(next)).expect(200);
      // /auth/me reads the role live.
      const me = await http()
        .get('/api/auth/me')
        .set(bearer(login.body.data.accessToken))
        .expect(200);
      expect(me.body.data.permissions).toEqual([
        'owners.assign',
        'activity.view',
      ]);
    });
  });

  // ---------------------------------------------------------------- activity

  it('Every user/role change writes an activity entry', async () => {
    const actor = await fixture('logger', adminRoleId, [...PERMISSION_KEYS]);
    const as = bearer(actor.token);
    const created = await http()
      .post('/api/users')
      .set(as)
      .send({
        name: 'Logged user',
        email: uniqueEmail('t5-logged'),
        roleId: memberRoleId,
        language: 'en',
        password: randomPassword(),
      })
      .expect(201);
    const userId = created.body.data.id as string;
    userIds.push(userId);
    await http()
      .patch(`/api/users/${userId}`)
      .set(as)
      .send({ roleId: assignerRoleId })
      .expect(200);
    // A PATCH that changes nothing logs nothing.
    await http()
      .patch(`/api/users/${userId}`)
      .set(as)
      .send({ name: 'Logged user' })
      .expect(200);
    await http()
      .post(`/api/users/${userId}/reset-password`)
      .set(as)
      .send({ newPassword: randomPassword() })
      .expect(200);

    const role = await http()
      .post('/api/roles')
      .set(as)
      .send({ name: `T5 logged ${Date.now()}`, permissions: ['data.export'] })
      .expect(201);
    const roleId = role.body.data.id as string;
    await http()
      .patch(`/api/roles/${roleId}`)
      .set(as)
      .send({ permissions: ['data.export', 'trash.restore'] })
      .expect(200);
    await http().delete(`/api/roles/${roleId}`).set(as).expect(200);

    // Refused changes log nothing.
    await http().delete(`/api/roles/${memberRoleId}`).set(as).expect(400);

    const entries = await db.activityEntry.findMany({
      where: { actorId: actor.id },
      orderBy: { createdAt: 'asc' },
    });
    expect(entries.map((e) => [e.type, e.targetKind, e.targetId])).toEqual([
      ['USER_CREATE', 'USER', userId],
      ['USER_UPDATE', 'USER', userId],
      ['PASSWORD_RESET', 'USER', userId],
      ['ROLE_CREATE', 'ROLE', roleId],
      ['ROLE_UPDATE', 'ROLE', roleId],
      ['ROLE_DELETE', 'ROLE', roleId],
    ]);
    expect(entries[1].details).toMatchObject({
      changed: ['roleId'],
      role: { from: { id: memberRoleId }, to: { id: assignerRoleId } },
    });
    expect(entries[4].details).toEqual({
      permissions: { added: ['trash.restore'], removed: [] },
    });
    expect(JSON.stringify(entries)).not.toMatch(/scrypt|password"/i);

    // The log is readable through the API by type.
    const log = await http()
      .get('/api/activity?type=USER_CREATE,ROLE_DELETE')
      .query({ actorId: actor.id })
      .set(as)
      .expect(200);
    expect(log.body.data.map((e: { type: string }) => e.type).sort()).toEqual([
      'ROLE_DELETE',
      'USER_CREATE',
    ]);
  });
});
