import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import type { Prisma, PrismaClient } from '@prisma/client';
import { ValueType, Workbook, type Worksheet } from 'exceljs';
import type { IncomingMessage } from 'node:http';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { configureApp } from '../src/app.setup';
import { createTestDb, randomLocalMobile } from './helpers';
import {
  bearer,
  createUserWithToken,
  ensureBuiltInRoles,
  signExpiredToken,
} from './helpers-auth';

/**
 * T11 — Excel exports. The export cases of the plan's T11 section are `it`s named after them,
 * then the generic checklist. Files are read back with exceljs.
 */

type Actor = Awaited<ReturnType<typeof createUserWithToken>>;

const e164 = (local: string) => `+20${local.slice(1)}`;
const XLSX =
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

function binary(
  response: unknown,
  done: (err: Error | null, body: Buffer) => void,
) {
  const res = response as IncomingMessage;
  const chunks: Buffer[] = [];
  res.on('data', (c: Buffer) => chunks.push(c));
  res.on('end', () => done(null, Buffer.concat(chunks)));
}

async function sheetOf(body: Buffer): Promise<Worksheet> {
  const wb = new Workbook();
  await wb.xlsx.load(body as unknown as ArrayBuffer);
  const ws = wb.worksheets[0];
  if (!ws) throw new Error('no worksheet');
  return ws;
}

/** Header row values, then each data row as an array (1-based columns flattened). */
function rowsOf(ws: Worksheet): { headers: string[]; rows: unknown[][] } {
  const all: unknown[][] = [];
  ws.eachRow({ includeEmpty: false }, (row) => {
    all.push((row.values as unknown[]).slice(1));
  });
  return { headers: (all[0] ?? []) as string[], rows: all.slice(1) };
}

describe('Exports (e2e)', () => {
  let app: INestApplication;
  let db: PrismaClient;
  const http = () => request(app.getHttpServer());
  const run = `T11x-${Date.now()}`;
  const AREA = `${run} Maadi`;
  const OTHER_AREA = `${run} Zamalek`;

  let admin: Actor;
  let member: Actor;
  let exporter: Actor; // data.export only
  const users: string[] = [];
  const roles: string[] = [];

  const download = (actor: Actor, path: string) =>
    http()
      .get(`/api${path}`)
      .set(bearer(actor.token))
      .buffer(true)
      .parse(binary);

  async function seedOwner(
    fields: Partial<Prisma.OwnerUncheckedCreateInput> & {
      phones?: string[];
    } = {},
  ): Promise<{ id: string; phones: string[] }> {
    const { phones = [e164(randomLocalMobile())], ...rest } = fields;
    const o = await db.owner.create({
      data: {
        name: `${run} owner`,
        area: AREA,
        createdById: admin.id,
        ...rest,
        phones: {
          create: phones.map((phone, position) => ({ phone, position })),
        },
      },
    });
    return { id: o.id, phones };
  }

  async function seedListing(
    fields: Partial<Prisma.ListingUncheckedCreateInput> = {},
  ): Promise<string> {
    const l = await db.listing.create({
      data: {
        purpose: 'SALE',
        type: 'APARTMENT',
        area: AREA,
        sizeSqm: 120,
        bedrooms: 3,
        price: 2_000_000,
        ownerName: `${run} listing owner`,
        ownerPhone: e164(randomLocalMobile()),
        createdById: admin.id,
        ...fields,
      },
    });
    return l.id;
  }

  beforeAll(async () => {
    db = createTestDb();
    const { adminRoleId, memberRoleId } = await ensureBuiltInRoles(db);
    admin = await createUserWithToken(db, 't11x-admin', adminRoleId, []);
    member = await createUserWithToken(db, 't11x-member', memberRoleId, []);
    const role = await db.role.create({
      data: { name: `${run} exporter`, permissions: ['data.export'] },
    });
    roles.push(role.id);
    exporter = await createUserWithToken(db, 't11x-exp', role.id, [
      'data.export',
    ]);
    users.push(admin.id, member.id, exporter.id);

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
      await db.listing.deleteMany({ where: { createdById: where } });
      await db.owner.deleteMany({ where: { createdById: where } });
      await db.user.deleteMany({ where: { id: where } });
      await db.role.deleteMany({ where: { id: { in: roles } } });
      await db.$disconnect();
    }
    await app?.close();
  });

  // ================================================================ plan cases

  it('Export as member → 403 (role); export respects filters; > 50 000 rows → 400 (contract)', async () => {
    for (const path of ['/exports/owners', '/exports/listings']) {
      const res = await http()
        .get(`/api${path}`)
        .set(bearer(member.token))
        .expect(403);
      expect(res.body.error).toBe('FORBIDDEN');
    }

    // Filters: area + status for owners, area + type for listings.
    const fresh = await seedOwner({ status: 'NEW', name: `${run} fresh` });
    await seedOwner({ status: 'CONTACTED', name: `${run} contacted` });
    await seedOwner({ status: 'NEW', area: OTHER_AREA });
    const owners = await download(
      admin,
      `/exports/owners?area=${encodeURIComponent(AREA)}&status=NEW`,
    ).expect(200);
    const o = rowsOf(await sheetOf(owners.body as Buffer));
    expect(o.rows).toHaveLength(1);
    expect(o.rows[0][0]).toBe(`${run} fresh`);
    expect(o.rows[0][1]).toBe(fresh.phones[0]);

    const villa = await seedListing({ type: 'VILLA', bedrooms: 5 });
    await seedListing({ type: 'APARTMENT' });
    await seedListing({ type: 'VILLA', status: 'SOLD' }); // default status = Available
    const listings = await download(
      admin,
      `/exports/listings?area=${encodeURIComponent(AREA)}&type=VILLA`,
    ).expect(200);
    const l = rowsOf(await sheetOf(listings.body as Buffer));
    expect(l.rows).toHaveLength(1);
    expect(l.rows[0][0]).toBe(`Villa · 5 BR · ${AREA}`);
    expect(await db.listing.count({ where: { id: villa } })).toBe(1);

    // > 50 000 matching rows → 400, no file.
    const bigArea = `${run} big`;
    const rows = Array.from({ length: 50_001 }, (_, i) => ({
      name: `${run} bulk ${i}`,
      area: bigArea,
      createdById: admin.id,
    }));
    for (let i = 0; i < rows.length; i += 10_000) {
      await db.owner.createMany({ data: rows.slice(i, i + 10_000) });
    }
    const big = await http()
      .get(`/api/exports/owners?area=${encodeURIComponent(bigArea)}`)
      .set(bearer(admin.token))
      .expect(400);
    expect(big.body).toMatchObject({
      success: false,
      error: 'EXPORT_TOO_LARGE',
    });
    await db.owner.deleteMany({ where: { area: bigArea } });
  }, 120_000);

  it('Export file phone column as text (leading `+` kept) (checklist: phone format)', async () => {
    const phones = [e164(randomLocalMobile()), '+20225551234'];
    await seedOwner({ name: `${run} phones`, phones, status: 'CALL_BACK' });
    const res = await download(
      admin,
      `/exports/owners?area=${encodeURIComponent(AREA)}&status=CALL_BACK`,
    ).expect(200);
    expect(res.headers['content-type']).toContain(XLSX);
    expect(res.headers['content-disposition']).toMatch(
      /^attachment; filename="owners-\d{4}-\d{2}-\d{2}\.xlsx"$/,
    );
    const ws = await sheetOf(res.body as Buffer);
    for (const [col, phone] of [
      [2, phones[0]],
      [3, phones[1]],
    ] as const) {
      const cell = ws.getRow(2).getCell(col);
      expect(cell.type).toBe(ValueType.String);
      expect(cell.value).toBe(phone);
      expect(cell.numFmt).toBe('@');
    }

    const listing = await seedListing({ type: 'STUDIO', bedrooms: 0 });
    const ls = await download(
      admin,
      `/exports/listings?area=${encodeURIComponent(AREA)}&type=STUDIO`,
    ).expect(200);
    const sheet = await sheetOf(ls.body as Buffer);
    const { headers } = rowsOf(sheet);
    const phoneCol = headers.indexOf('Owner phone') + 1;
    const stored = await db.listing.findUniqueOrThrow({
      where: { id: listing },
    });
    const cell = sheet.getRow(2).getCell(phoneCol);
    expect(cell.type).toBe(ValueType.String);
    expect(cell.value).toBe(stored.ownerPhone);
    expect(String(cell.value).startsWith('+20')).toBe(true);
  });

  it('Export writes an activity entry (business: activity log)', async () => {
    const query = `area=${encodeURIComponent(AREA)}&status=NEW`;
    const before = await db.activityEntry.count({
      where: { actorId: admin.id, type: 'EXPORT' },
    });
    await download(admin, `/exports/owners?${query}`).expect(200);
    await download(
      admin,
      `/exports/listings?area=${encodeURIComponent(AREA)}`,
    ).expect(200);
    const entries = await db.activityEntry.findMany({
      where: { actorId: admin.id, type: 'EXPORT' },
      orderBy: { createdAt: 'asc' },
    });
    expect(entries).toHaveLength(before + 2);
    const [owners, listings] = entries.slice(-2);
    expect(owners.details).toMatchObject({
      kind: 'OWNERS',
      count: 1,
      filters: { area: AREA, status: ['NEW'] },
    });
    expect(owners.summary).toBe('Exported 1 owners');
    expect(listings.details).toMatchObject({ kind: 'LISTINGS' });

    // A refused export logs nothing.
    await http()
      .get('/api/exports/owners')
      .set(bearer(member.token))
      .expect(403);
    expect(
      await db.activityEntry.count({
        where: { actorId: member.id, type: 'EXPORT' },
      }),
    ).toBe(0);
  });

  // ================================================================ more rules

  it('Arabic caller gets Arabic headers, labels and a right-to-left sheet', async () => {
    await db.user.update({ where: { id: admin.id }, data: { language: 'ar' } });
    try {
      const res = await download(
        admin,
        `/exports/owners?area=${encodeURIComponent(AREA)}&status=NEW`,
      ).expect(200);
      const ws = await sheetOf(res.body as Buffer);
      const { headers, rows } = rowsOf(ws);
      expect(headers.slice(0, 2)).toEqual(['الاسم', 'الهاتف 1']);
      expect(rows[0][5]).toBe('جديد');
      expect(ws.views[0]).toMatchObject({ rightToLeft: true });

      const ls = await download(
        admin,
        `/exports/listings?area=${encodeURIComponent(AREA)}&type=VILLA`,
      ).expect(200);
      const l = rowsOf(await sheetOf(ls.body as Buffer));
      expect(l.headers[0]).toBe('العنوان');
      expect(l.rows[0][1]).toBe('بيع');
    } finally {
      await db.user.update({
        where: { id: admin.id },
        data: { language: 'en' },
      });
    }
  });

  it('data.export without owners.viewAll / listings.manageAll: own owners only, other owner phones blank', async () => {
    await seedOwner({ name: `${run} not theirs`, status: 'INTERESTED' });
    const mine = await seedOwner({
      name: `${run} theirs`,
      status: 'INTERESTED',
      assignedToId: exporter.id,
    });
    const owners = rowsOf(
      await sheetOf(
        (
          await download(
            exporter,
            `/exports/owners?area=${encodeURIComponent(AREA)}`,
          ).expect(200)
        ).body as Buffer,
      ),
    );
    expect(owners.rows.map((r) => r[0])).toEqual([`${run} theirs`]);
    expect(owners.rows[0][1]).toBe(mine.phones[0]);

    const own = await seedListing({
      type: 'DUPLEX',
      assignedToId: exporter.id,
    });
    await seedListing({ type: 'DUPLEX' });
    const res = await download(
      exporter,
      `/exports/listings?area=${encodeURIComponent(AREA)}&type=DUPLEX`,
    ).expect(200);
    const ws = await sheetOf(res.body as Buffer);
    const { headers, rows } = rowsOf(ws);
    const phoneAt = headers.indexOf('Owner phone');
    const nameAt = headers.indexOf('Owner');
    const ownPhone = (
      await db.listing.findUniqueOrThrow({ where: { id: own } })
    ).ownerPhone;
    const phonesShown = rows.map((r) => r[phoneAt] ?? null);
    expect(rows).toHaveLength(2);
    expect(phonesShown).toEqual(expect.arrayContaining([ownPhone, null]));
    expect(rows.filter((r) => r[nameAt] == null)).toHaveLength(1);
  });

  it('an empty result is a file with the header row only', async () => {
    const res = await download(
      admin,
      `/exports/owners?area=${encodeURIComponent(`${run} nowhere`)}`,
    ).expect(200);
    const { headers, rows } = rowsOf(await sheetOf(res.body as Buffer));
    expect(headers[0]).toBe('Name');
    expect(rows).toHaveLength(0);
  });

  // ================================================================ generic checklist

  describe('generic checklist', () => {
    it('no token, expired token → 401 (enveloped)', async () => {
      for (const path of ['/exports/owners', '/exports/listings']) {
        const res = await http().get(`/api${path}`).expect(401);
        expect(res.body.success).toBe(false);
        await http()
          .get(`/api${path}`)
          .set(bearer(signExpiredToken(admin.claims)))
          .expect(401);
      }
    });

    it('bad filters → 400', async () => {
      for (const q of [
        'status=NOPE',
        'assignedTo=someone',
        'page=1',
        'limit=20',
        'foo=bar',
        'importId=x',
      ]) {
        await http()
          .get(`/api/exports/owners?${q}`)
          .set(bearer(admin.token))
          .expect(400);
      }
      for (const q of [
        'priceMin=10&priceMax=5',
        'type=CASTLE',
        'bedroomsMin=-1',
        'page=2',
      ]) {
        await http()
          .get(`/api/exports/listings?${q}`)
          .set(bearer(admin.token))
          .expect(400);
      }
    });

    it('a name search with `%` and `_` matches literally', async () => {
      await seedOwner({ name: `${run} 100%_sure`, status: 'NOT_INTERESTED' });
      await seedOwner({ name: `${run} 100xxsure`, status: 'NOT_INTERESTED' });
      const res = await download(
        admin,
        `/exports/owners?q=${encodeURIComponent('100%_sure')}&area=${encodeURIComponent(AREA)}`,
      ).expect(200);
      const { rows } = rowsOf(await sheetOf(res.body as Buffer));
      expect(rows.map((r) => r[0])).toEqual([`${run} 100%_sure`]);
    });
  });
});
