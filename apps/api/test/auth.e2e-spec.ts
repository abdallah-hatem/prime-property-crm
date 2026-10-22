import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import type { PrismaClient } from '@prisma/client';
import { PERMISSION_KEYS } from '@prime-crm/shared';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { configureApp } from '../src/app.setup';
import { Clock } from '../src/common/providers/clock';
import { hashPassword } from '../src/common/utils/password.util';
import { DatabaseService } from '../src/database/database.service';
import { SessionService } from '../src/domains/auth/session.service';
import { createTestDb, randomPassword, uniqueEmail } from './helpers';
import { bearer, ensureBuiltInRoles, signExpiredToken } from './helpers-auth';

/**
 * T4 — auth. Each edge case from the plan (T4 section) is an `it` named after it, plus the
 * generic checklist. Users are created directly; time moves through the injected Clock.
 */

const SECOND = 1_000;
const MINUTE = 60 * SECOND;

describe('Auth (e2e)', () => {
  let app: INestApplication;
  let db: PrismaClient;
  let now: Date;
  let adminRoleId: string;
  let memberRoleId: string;
  const userIds: string[] = [];
  const emails: string[] = [];
  const http = () => request(app.getHttpServer());
  const advance = (ms: number) => {
    now = new Date(now.getTime() + ms);
  };

  async function makeUser(
    label: string,
    fields: { roleId?: string; active?: boolean; name?: string } = {},
  ) {
    const email = uniqueEmail(`t4-${label}`);
    const password = randomPassword();
    const user = await db.user.create({
      data: {
        name: fields.name ?? `E2E ${label}`,
        email,
        passwordHash: await hashPassword(password),
        roleId: fields.roleId ?? memberRoleId,
        active: fields.active ?? true,
      },
    });
    userIds.push(user.id);
    emails.push(email);
    return { id: user.id, email, password };
  }

  type Session = { accessToken: string; refreshToken: string };
  async function signIn(email: string, password: string): Promise<Session> {
    const res = await http()
      .post('/api/auth/login')
      .send({ email, password })
      .expect(200);
    return res.body.data as Session;
  }
  const refresh = (refreshToken: string) =>
    http().post('/api/auth/refresh').send({ refreshToken });

  beforeAll(async () => {
    db = createTestDb();
    ({ adminRoleId, memberRoleId } = await ensureBuiltInRoles(db));

    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = moduleRef.createNestApplication();
    configureApp(app);
    await app.init();

    now = new Date();
    jest.spyOn(app.get(Clock), 'now').mockImplementation(() => new Date(now));
  });

  afterAll(async () => {
    if (db) {
      await db.loginAttempt.deleteMany({ where: { email: { in: emails } } });
      await db.user.deleteMany({ where: { id: { in: userIds } } });
      await db.$disconnect();
    }
    await app?.close();
  });

  // ------------------------------------------------------------- sign-in

  describe('POST /auth/login', () => {
    it('Correct email + password → tokens and Me with permissions', async () => {
      const admin = await makeUser('admin', {
        roleId: adminRoleId,
        name: 'سارة المدير',
      });
      const res = await http()
        .post('/api/auth/login')
        .send({ email: admin.email, password: admin.password })
        .expect(200);
      expect(res.body).toMatchObject({ success: true, statusCode: 200 });
      const { accessToken, refreshToken, user } = res.body.data;
      expect(typeof accessToken).toBe('string');
      expect(typeof refreshToken).toBe('string');
      expect(user).toEqual({
        id: admin.id,
        name: 'سارة المدير',
        email: admin.email,
        phone: null,
        language: 'en',
        active: true,
        role: { id: adminRoleId, name: expect.any(String) },
        createdAt: expect.any(String),
        permissions: [...PERMISSION_KEYS],
      });
      expect(JSON.stringify(res.body)).not.toMatch(/passwordHash|scrypt/);

      // The access token works, and carries the role and permissions.
      const claims = JSON.parse(
        Buffer.from(accessToken.split('.')[1], 'base64url').toString(),
      );
      expect(claims).toMatchObject({ sub: admin.id, roleId: adminRoleId });
      expect(claims.permissions).toEqual([...PERMISSION_KEYS]);
      expect(claims.exp - claims.iat).toBe(15 * 60);
      await http().get('/api/activity').set(bearer(accessToken)).expect(200);

      // The refresh token is stored hashed, never as sent.
      const stored = await db.refreshToken.findMany({
        where: { userId: admin.id },
      });
      expect(stored).toHaveLength(1);
      expect(stored[0].tokenHash).not.toBe(refreshToken);
    });

    it('a member signs in with no permissions', async () => {
      const member = await makeUser('member');
      const res = await http()
        .post('/api/auth/login')
        .send({ email: member.email, password: member.password })
        .expect(200);
      expect(res.body.data.user.permissions).toEqual([]);
    });

    it('Wrong password, unknown email, deactivated user → identical 401 INVALID_CREDENTIALS', async () => {
      const member = await makeUser('wrongpw');
      const inactive = await makeUser('inactive', { active: false });
      const unknown = uniqueEmail('t4-nobody');
      emails.push(unknown);

      const bodies = [];
      for (const body of [
        { email: member.email, password: 'definitely-wrong' },
        { email: unknown, password: member.password },
        { email: inactive.email, password: inactive.password },
      ]) {
        const res = await http().post('/api/auth/login').send(body).expect(401);
        const { timestamp: _t, ...rest } = res.body;
        bodies.push(rest);
      }
      expect(bodies[0]).toEqual({
        success: false,
        statusCode: 401,
        error: 'INVALID_CREDENTIALS',
        message: 'Email or password is incorrect',
        path: '/api/auth/login',
      });
      expect(bodies[1]).toEqual(bodies[0]);
      expect(bodies[2]).toEqual(bodies[0]);
      expect(
        await db.refreshToken.count({ where: { userId: inactive.id } }),
      ).toBe(0);
    });

    it('Email matched case-insensitively and trimmed', async () => {
      const member = await makeUser('case');
      const res = await http()
        .post('/api/auth/login')
        .send({
          email: `  ${member.email.toUpperCase()}\t`,
          password: member.password,
        })
        .expect(200);
      expect(res.body.data.user.id).toBe(member.id);
    });

    it('11th failed attempt within 15 min → 429', async () => {
      const member = await makeUser('ratelimit');
      for (let i = 0; i < 10; i++) {
        advance(SECOND);
        await http()
          .post('/api/auth/login')
          .send({ email: member.email, password: `wrong-${i}` })
          .expect(401);
      }
      const res = await http()
        .post('/api/auth/login')
        .send({ email: member.email, password: member.password })
        .expect(429);
      expect(res.body).toMatchObject({
        success: false,
        error: 'TOO_MANY_REQUESTS',
      });

      // Counted per email, case and spaces ignored.
      await http()
        .post('/api/auth/login')
        .send({ email: ` ${member.email.toUpperCase()}`, password: 'x' })
        .expect(429);

      // Another email is not affected.
      const other = await makeUser('ratelimit-other');
      await signIn(other.email, other.password);

      // Once the oldest failure leaves the 15-minute window, a correct password signs in.
      advance(15 * MINUTE - 9 * SECOND);
      await signIn(member.email, member.password);
    });

    it('a success resets the failure count', async () => {
      const member = await makeUser('reset-count');
      for (let i = 0; i < 9; i++) {
        await http()
          .post('/api/auth/login')
          .send({ email: member.email, password: 'wrong' })
          .expect(401);
      }
      await signIn(member.email, member.password);
      for (let i = 0; i < 10; i++) {
        await http()
          .post('/api/auth/login')
          .send({ email: member.email, password: 'wrong' })
          .expect(401);
      }
    });

    it('validation: missing, extra and wrong-type fields → 400', async () => {
      for (const body of [
        {},
        { email: 'a@prime.test' },
        { password: 'x' },
        { email: 'a@prime.test', password: 'x', remember: true },
        { email: 123, password: 'x' },
        { email: 'a@prime.test', password: ['x'] },
        { email: 'not-an-email', password: 'x' },
      ]) {
        const res = await http().post('/api/auth/login').send(body).expect(400);
        expect(res.body.error).toBe('VALIDATION_FAILED');
      }
    });
  });

  // ------------------------------------------------------------- refresh

  describe('POST /auth/refresh', () => {
    it('Refresh rotates: old token reused after the grace window → 401 and the whole family revoked', async () => {
      const member = await makeUser('rotate');
      const first = await signIn(member.email, member.password);
      const second = (await refresh(first.refreshToken).expect(200)).body.data;
      expect(second.refreshToken).not.toBe(first.refreshToken);
      await http()
        .get('/api/auth/me')
        .set(bearer(second.accessToken))
        .expect(200);

      const third = (await refresh(second.refreshToken).expect(200)).body.data;

      advance(31 * SECOND);
      const res = await refresh(first.refreshToken).expect(401);
      expect(res.body).toMatchObject({
        success: false,
        error: 'INVALID_REFRESH',
      });

      // The whole family is gone, the newest token included.
      await refresh(third.refreshToken).expect(401);
      const family = await db.refreshToken.findMany({
        where: { userId: member.id },
      });
      expect(family.length).toBe(3);
      expect(family.every((t) => t.revokedAt !== null)).toBe(true);
    });

    it('Two refreshes with the same token within 30 s → both succeed', async () => {
      const member = await makeUser('grace');
      const start = await signIn(member.email, member.password);

      // Two tabs at once.
      const [a, b] = await Promise.all([
        refresh(start.refreshToken),
        refresh(start.refreshToken),
      ]);
      expect([a.status, b.status]).toEqual([200, 200]);
      expect(a.body.data.refreshToken).not.toBe(b.body.data.refreshToken);

      // And a third, 30 s after the first use: still inside the window.
      advance(30 * SECOND);
      const c = await refresh(start.refreshToken).expect(200);

      // Every pair is in the same family and keeps working.
      for (const pair of [a.body.data, b.body.data, c.body.data]) {
        await http()
          .get('/api/auth/me')
          .set(bearer(pair.accessToken))
          .expect(200);
        await refresh(pair.refreshToken).expect(200);
      }
      const families = await db.refreshToken.groupBy({
        by: ['familyId'],
        where: { userId: member.id },
      });
      expect(families).toHaveLength(1);
    });

    it('expired refresh token (30 days) → 401', async () => {
      const member = await makeUser('expired-refresh');
      const start = await signIn(member.email, member.password);
      advance(30 * 24 * 60 * MINUTE);
      await refresh(start.refreshToken).expect(401);
    });

    it('unknown refresh token → 401 INVALID_REFRESH; bad body → 400', async () => {
      const res = await refresh('not-a-real-token').expect(401);
      expect(res.body.error).toBe('INVALID_REFRESH');
      await http().post('/api/auth/refresh').send({}).expect(400);
      await http()
        .post('/api/auth/refresh')
        .send({ refreshToken: 5 })
        .expect(400);
    });
  });

  // ------------------------------------------------------- logout & revoke

  describe('sessions', () => {
    it('logout revokes the token’s family only', async () => {
      const member = await makeUser('logout');
      const phone = await signIn(member.email, member.password);
      const laptop = await signIn(member.email, member.password);
      const res = await http()
        .post('/api/auth/logout')
        .set(bearer(phone.accessToken))
        .send({ refreshToken: phone.refreshToken })
        .expect(200);
      expect(res.body.data).toBeNull();
      await refresh(phone.refreshToken).expect(401);
      await refresh(laptop.refreshToken).expect(200);
    });

    it('logout with someone else’s refresh token leaves it alone', async () => {
      const a = await makeUser('logout-a');
      const b = await makeUser('logout-b');
      const sa = await signIn(a.email, a.password);
      const sb = await signIn(b.email, b.password);
      await http()
        .post('/api/auth/logout')
        .set(bearer(sa.accessToken))
        .send({ refreshToken: sb.refreshToken })
        .expect(200);
      await refresh(sb.refreshToken).expect(200);
    });

    it('logout without a token → 401', async () => {
      await http()
        .post('/api/auth/logout')
        .send({ refreshToken: 'x' })
        .expect(401);
    });

    it('Deactivated user’s valid access token → 401 on next request', async () => {
      const member = await makeUser('deactivated');
      const session = await signIn(member.email, member.password);
      await http()
        .get('/api/auth/me')
        .set(bearer(session.accessToken))
        .expect(200);

      await db.user.update({
        where: { id: member.id },
        data: { active: false },
      });
      for (const path of ['/api/auth/me', '/api/activity']) {
        const res = await http()
          .get(path)
          .set(bearer(session.accessToken))
          .expect(401);
        expect(res.body).toMatchObject({
          success: false,
          error: 'UNAUTHORIZED',
        });
      }
      // Refresh is refused too, and revokes the family.
      await refresh(session.refreshToken).expect(401);
    });

    it('Password reset by admin revokes all refresh tokens (revokeAllSessions)', async () => {
      const member = await makeUser('reset');
      const other = await makeUser('reset-bystander');
      const s1 = await signIn(member.email, member.password);
      const s2 = await signIn(member.email, member.password);
      const bystander = await signIn(other.email, other.password);

      const database = app.get(DatabaseService);
      const sessions = app.get(SessionService);
      const revoked = await database.transaction((tx) =>
        sessions.revokeAllSessions(tx, member.id),
      );
      expect(revoked).toBe(2);

      await refresh(s1.refreshToken).expect(401);
      await refresh(s2.refreshToken).expect(401);
      await refresh(bystander.refreshToken).expect(200);
    });

    it('revokeAllSessions rolls back with its transaction', async () => {
      const member = await makeUser('reset-rollback');
      const s = await signIn(member.email, member.password);
      const database = app.get(DatabaseService);
      const sessions = app.get(SessionService);
      await expect(
        database.transaction(async (tx) => {
          await sessions.revokeAllSessions(tx, member.id);
          throw new Error('later step failed');
        }),
      ).rejects.toThrow('later step failed');
      await refresh(s.refreshToken).expect(200);
    });
  });

  // ------------------------------------------------------------------ me

  describe('/auth/me', () => {
    it('GET /auth/me → Me with live permissions', async () => {
      const member = await makeUser('me');
      const s = await signIn(member.email, member.password);
      const res = await http()
        .get('/api/auth/me')
        .set(bearer(s.accessToken))
        .expect(200);
      expect(res.body.data).toMatchObject({
        id: member.id,
        permissions: [],
        active: true,
      });
    });

    it('no token, expired token, forged token → 401', async () => {
      const member = await makeUser('me-401');
      await http().get('/api/auth/me').expect(401);
      await http()
        .get('/api/auth/me')
        .set(
          bearer(
            signExpiredToken({
              sub: member.id,
              roleId: memberRoleId,
              permissions: [],
            }),
          ),
        )
        .expect(401);
      const s = await signIn(member.email, member.password);
      const [h, p] = s.accessToken.split('.');
      await http()
        .get('/api/auth/me')
        .set(bearer(`${h}.${p}.forged-signature`))
        .expect(401);
    });

    it('PATCH /auth/me cannot change role, email or active', async () => {
      const member = await makeUser('patch-forbidden');
      const s = await signIn(member.email, member.password);
      for (const body of [
        { roleId: adminRoleId },
        { role: { id: adminRoleId } },
        { email: 'new@prime.test' },
        { active: false },
        { permissions: [...PERMISSION_KEYS] },
        { name: 'ok', roleId: adminRoleId },
      ]) {
        const res = await http()
          .patch('/api/auth/me')
          .set(bearer(s.accessToken))
          .send(body)
          .expect(400);
        expect(res.body.error).toBe('VALIDATION_FAILED');
      }
      const row = await db.user.findUniqueOrThrow({ where: { id: member.id } });
      expect(row).toMatchObject({
        roleId: memberRoleId,
        email: member.email,
        active: true,
        name: 'E2E patch-forbidden',
      });
    });

    it('PATCH /auth/me updates name (Arabic, trimmed), phone (normalised) and language', async () => {
      const member = await makeUser('patch');
      const s = await signIn(member.email, member.password);
      const res = await http()
        .patch('/api/auth/me')
        .set(bearer(s.accessToken))
        .send({
          name: '  سارة محمود 🌟 ',
          phone: '0100 123 4567',
          language: 'ar',
        })
        .expect(200);
      expect(res.body.data).toMatchObject({
        id: member.id,
        name: 'سارة محمود 🌟',
        phone: '+201001234567',
        language: 'ar',
        permissions: [],
      });

      const cleared = await http()
        .patch('/api/auth/me')
        .set(bearer(s.accessToken))
        .send({ phone: null })
        .expect(200);
      expect(cleared.body.data.phone).toBeNull();

      const same = await http()
        .patch('/api/auth/me')
        .set(bearer(s.accessToken))
        .send({})
        .expect(200);
      expect(same.body.data.name).toBe('سارة محمود 🌟');
    });

    it('PATCH /auth/me rejects bad values → 400', async () => {
      const member = await makeUser('patch-bad');
      const s = await signIn(member.email, member.password);
      for (const body of [
        { name: '' },
        { name: '   ' },
        { name: 'n'.repeat(101) },
        { name: 42 },
        { phone: 'call me' },
        { phone: '' },
        { language: 'fr' },
      ]) {
        await http()
          .patch('/api/auth/me')
          .set(bearer(s.accessToken))
          .send(body)
          .expect(400);
      }
      await http().patch('/api/auth/me').send({ name: 'x' }).expect(401);
    });
  });

  // ------------------------------------------------------------ password

  describe('POST /auth/me/password', () => {
    it('Change password with wrong current → 400 WRONG_PASSWORD; new < 8 chars → 400', async () => {
      const member = await makeUser('pw');
      const s = await signIn(member.email, member.password);
      const wrong = await http()
        .post('/api/auth/me/password')
        .set(bearer(s.accessToken))
        .send({
          currentPassword: 'not-my-password',
          newPassword: 'new-password-1',
        })
        .expect(400);
      expect(wrong.body.error).toBe('WRONG_PASSWORD');

      const short = await http()
        .post('/api/auth/me/password')
        .set(bearer(s.accessToken))
        .send({ currentPassword: member.password, newPassword: '1234567' })
        .expect(400);
      expect(short.body.error).toBe('VALIDATION_FAILED');

      for (const body of [
        { newPassword: 'new-password-1' },
        { currentPassword: member.password },
        { currentPassword: member.password, newPassword: 12345678 },
        {
          currentPassword: member.password,
          newPassword: 'new-password-1',
          userId: member.id,
        },
      ]) {
        await http()
          .post('/api/auth/me/password')
          .set(bearer(s.accessToken))
          .send(body)
          .expect(400);
      }
      // Nothing changed: the old password still signs in.
      await signIn(member.email, member.password);
    });

    it('a changed password signs in, the old one does not, and other sessions end', async () => {
      const member = await makeUser('pw-ok');
      const current = await signIn(member.email, member.password);
      const other = await signIn(member.email, member.password);
      const newPassword = randomPassword();

      const res = await http()
        .post('/api/auth/me/password')
        .set(bearer(current.accessToken))
        .send({ currentPassword: member.password, newPassword })
        .expect(200);
      expect(res.body.data).toBeNull();

      await refresh(other.refreshToken).expect(401);
      await refresh(current.refreshToken).expect(200);
      await http()
        .post('/api/auth/login')
        .send({ email: member.email, password: member.password })
        .expect(401);
      await signIn(member.email, newPassword);
    });
  });
});
