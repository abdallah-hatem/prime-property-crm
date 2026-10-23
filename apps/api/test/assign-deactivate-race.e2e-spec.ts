import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import type { PrismaClient } from '@prisma/client';
import { PERMISSION_KEYS } from '@prime-crm/shared';
import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { configureApp } from '../src/app.setup';
import { BlobConfig } from '../src/domains/uploads/blob.config';
import { createTestDb, randomLocalMobile } from './helpers';
import {
  bearer,
  createUserWithToken,
  ensureBuiltInRoles,
} from './helpers-auth';

/**
 * T10b — an assignment to a member racing that member's deactivation. Deactivation locks the
 * user row first; the assignment reads its assignee FOR SHARE inside its transaction. So either
 * the assignment commits first (its owners are then handed over to the recipient) or it waits
 * and finds the member inactive (400 INVALID_ASSIGNEE). Never work left on an inactive member.
 */

type Actor = Awaited<ReturnType<typeof createUserWithToken>>;

const e164 = (local: string) => `+20${local.slice(1)}`;
const DAY = 24 * 60 * 60 * 1000;
const ROUNDS = 10;
const BATCH = 3;
const STORE_HOST = 't10bteststore.private.blob.vercel-storage.com';
const FAKE_BLOB_TOKEN = `vercel_blob_rw_t10bteststore_${randomUUID().replace(/-/g, '')}`;

describe('Assign vs deactivate race (e2e)', () => {
  let app: INestApplication;
  let db: PrismaClient;
  const http = () => request(app.getHttpServer());
  const run = `T10b-${Date.now()}`;

  let memberRoleId: string;
  let admin: Actor;
  let recipient: Actor;
  const users: string[] = [];

  async function newUser(
    label: string,
    roleId = memberRoleId,
    permissions: string[] = [],
  ): Promise<Actor> {
    const user = await createUserWithToken(db, label, roleId, permissions);
    users.push(user.id);
    return user;
  }

  /** A live owner with a live listing and one open reminder, all on `memberId` (or nobody). */
  async function seedWork(memberId: string | null) {
    const phone = e164(randomLocalMobile());
    const owner = await db.owner.create({
      data: {
        name: `${run} owner`,
        createdById: admin.id,
        assignedToId: memberId,
        status: 'LISTED',
        phones: { create: [{ phone, position: 0 }] },
      },
    });
    await db.listing.create({
      data: {
        purpose: 'SALE',
        type: 'APARTMENT',
        area: `${run} Zayed`,
        sizeSqm: 120,
        bedrooms: 3,
        price: 3_000_000,
        ownerName: owner.name,
        ownerPhone: phone,
        ownerId: owner.id,
        assignedToId: memberId,
        createdById: admin.id,
      },
    });
    await db.reminder.create({
      data: {
        ownerId: owner.id,
        memberId,
        dueAt: new Date(Date.now() + DAY),
        createdById: admin.id,
      },
    });
    return owner.id;
  }

  const post = (actor: Actor, path: string, body: object) =>
    http().post(`/api${path}`).set(bearer(actor.token)).send(body);

  beforeAll(async () => {
    db = createTestDb();
    const roles = await ensureBuiltInRoles(db);
    memberRoleId = roles.memberRoleId;
    admin = await newUser('t10b-admin', roles.adminRoleId, [
      ...PERMISSION_KEYS,
    ]);
    recipient = await newUser('t10b-recipient');

    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(BlobConfig)
      .useValue({ token: () => FAKE_BLOB_TOKEN, hosts: () => [STORE_HOST] })
      .compile();
    app = moduleRef.createNestApplication();
    configureApp(app);
    await app.init();
  });

  afterAll(async () => {
    if (db) {
      const where = { in: users };
      await db.activityEntry.deleteMany({ where: { actorId: where } });
      await db.refreshToken.deleteMany({ where: { userId: where } });
      await db.reminder.deleteMany({
        where: { OR: [{ memberId: where }, { createdById: where }] },
      });
      await db.ownerAssignment.deleteMany({
        where: {
          OR: [{ byId: where }, { fromMemberId: where }, { toMemberId: where }],
        },
      });
      await db.listing.deleteMany({ where: { createdById: where } });
      await db.owner.deleteMany({ where: { createdById: where } });
      await db.user.deleteMany({ where: { id: where } });
      await db.$disconnect();
    }
    await app?.close();
  });

  it('Assigning owners to a member while that member is being deactivated → the assign is refused (400 INVALID_ASSIGNEE) or the owners end up with the hand-over recipient; never on the inactive member (invariant: assign only to active members)', async () => {
    const outcomes = { assigned: 0, refused: 0 };
    for (let round = 0; round < ROUNDS; round++) {
      const member = await newUser(`t10b-m${round}`);
      await seedWork(member.id); // something for the hand-over to move
      const batch: string[] = [];
      for (let i = 0; i < BATCH; i++) batch.push(await seedWork(null));

      const [assign, deactivate] = await Promise.all([
        post(admin, '/owners/assign', {
          ownerIds: batch,
          assigneeId: member.id,
        }),
        post(admin, `/users/${member.id}/deactivate`, {
          handOverTo: recipient.id,
        }),
      ]);

      expect(deactivate.status).toBe(200);
      expect([200, 400]).toContain(assign.status);

      // Nothing live is left on the deactivated member, whoever won.
      const live = { assignedToId: member.id, deletedAt: null };
      expect(await db.owner.count({ where: live })).toBe(0);
      expect(await db.listing.count({ where: live })).toBe(0);
      expect(
        await db.reminder.count({
          where: { memberId: member.id, doneAt: null },
        }),
      ).toBe(0);

      const owners = await db.owner.findMany({
        where: { id: { in: batch } },
        select: { assignedToId: true },
      });
      if (assign.status === 200) {
        outcomes.assigned++;
        expect(assign.body.data).toEqual({ moved: BATCH });
        expect(owners.every((o) => o.assignedToId === recipient.id)).toBe(true);
        expect(
          await db.listing.count({
            where: { ownerId: { in: batch }, assignedToId: recipient.id },
          }),
        ).toBe(BATCH);
        expect(
          await db.reminder.count({
            where: {
              ownerId: { in: batch },
              memberId: recipient.id,
              doneAt: null,
            },
          }),
        ).toBe(BATCH);
      } else {
        outcomes.refused++;
        expect(assign.body.error).toBe('INVALID_ASSIGNEE');
        expect(owners.every((o) => o.assignedToId === null)).toBe(true);
      }
    }
    expect(outcomes.assigned + outcomes.refused).toBe(ROUNDS);
  });
});
