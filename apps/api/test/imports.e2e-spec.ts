import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import type { PrismaClient } from '@prisma/client';
import { latinDigits } from '@prime-crm/shared';
import ExcelJS from 'exceljs';
import request from 'supertest';
import * as XLSX from 'xlsx';
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
 * T9 — imports of owners and listings. Every edge case of the plan's T9 section is an `it`
 * named after it, then the generic checklist (auth, validation, paging, wrong state, file
 * formats, mapping suggestions, concurrency) and the 20 000-row timing run. Files are built in
 * the test (exceljs, SheetJS, plain CSV text): no binary fixtures.
 */

type Actor = Awaited<ReturnType<typeof createUserWithToken>>;
type Cell = string | number | null;

const e164 = (local: string) => `+20${local.slice(1)}`;
const toArabicDigits = (digits: string) =>
  digits.replace(/\d/g, (d) => String.fromCharCode(0x0660 + Number(d)));

function csv(rows: Cell[][], { bom = false, delimiter = ',' } = {}): Buffer {
  const text = rows
    .map((r) =>
      r
        .map((c) => {
          const s = c === null ? '' : String(c);
          return /[",;\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
        })
        .join(delimiter),
    )
    .join('\r\n');
  return Buffer.from(bom ? String.fromCharCode(0xfeff) + text : text, 'utf8');
}

async function xlsx(rows: Cell[][]): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet('Owners');
  rows.forEach((r) => sheet.addRow(r));
  workbook.addWorksheet('Ignored').addRow(['Name', 'Phone']);
  return Buffer.from(await workbook.xlsx.writeBuffer());
}

function xls(rows: Cell[][]): Buffer {
  const book = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(book, XLSX.utils.aoa_to_sheet(rows), 'S');
  return XLSX.write(book, { type: 'buffer', bookType: 'biff8' }) as Buffer;
}

describe('Imports (e2e)', () => {
  let app: INestApplication;
  let db: PrismaClient;
  const http = () => request(app.getHttpServer());
  const run = `T9-${Date.now()}`;
  const AREA = `${run} Maadi`;

  let admin: Actor;
  let admin2: Actor;
  let member: Actor;
  let memberB: Actor;
  let importer: Actor; // owners.import only
  let creator: Actor; // listings.create only
  let inactive: Actor;
  const users: string[] = [];
  const roles: string[] = [];

  const as = (actor: Actor) => ({
    get: (path: string) => http().get(`/api${path}`).set(bearer(actor.token)),
    post: (path: string, body: object = {}) =>
      http().post(`/api${path}`).set(bearer(actor.token)).send(body),
  });

  const upload = (
    actor: Actor,
    kind: string,
    file: Buffer,
    name = 'owners.csv',
  ) =>
    http()
      .post('/api/imports')
      .set(bearer(actor.token))
      .field('kind', kind)
      .attach('file', file, name);

  const OWNER_MAPPING = { name: 'Name', phone: 'Phone', area: 'Area' };
  const LISTING_HEADERS = [
    'Owner',
    'Phone',
    'Purpose',
    'Type',
    'Area',
    'Size',
    'Price',
    'Bedrooms',
  ];
  const LISTING_MAPPING = {
    name: 'Owner',
    phone: 'Phone',
    purpose: 'Purpose',
    type: 'Type',
    area: 'Area',
    sizeSqm: 'Size',
    price: 'Price',
    bedrooms: 'Bedrooms',
  };
  const listingRow = (
    phone: string,
    extra: Partial<Record<string, Cell>> = {},
  ) => {
    const row: Record<string, Cell> = {
      Owner: 'Hany Adel',
      Phone: phone,
      Purpose: 'Sale',
      Type: 'Apartment',
      Area: AREA,
      Size: 140,
      Price: 2_500_000,
      Bedrooms: 3,
      ...extra,
    };
    return LISTING_HEADERS.map((h) => row[h]);
  };

  /** Upload + preview; returns the job id and the preview. */
  async function staged(
    actor: Actor,
    kind: 'OWNERS' | 'LISTINGS',
    file: Buffer,
    mapping: Record<string, string>,
    extra: object = {},
    name = 'file.csv',
  ) {
    const up = await upload(actor, kind, file, name).expect(201);
    const id = up.body.data.id as string;
    const pv = await as(actor)
      .post(`/imports/${id}/preview`, { mapping, ...extra })
      .expect(200);
    return { id, preview: pv.body.data, upload: up.body.data };
  }

  const ownersFile = (rows: Cell[][]) =>
    csv([['Name', 'Phone', 'Area'], ...rows]);
  const listingsFile = (rows: Cell[][]) => csv([LISTING_HEADERS, ...rows]);

  async function seedOwner(phone: string, extra: object = {}) {
    return db.owner.create({
      data: {
        name: `${run} existing`,
        createdById: admin.id,
        phones: { create: [{ phone: e164(phone), position: 0 }] },
        ...extra,
      },
    });
  }

  async function seedListing(phone: string) {
    return db.listing.create({
      data: {
        purpose: 'SALE',
        type: 'VILLA',
        area: AREA,
        sizeSqm: 200,
        price: 5_000_000,
        ownerName: 'Listing owner',
        ownerPhone: e164(phone),
        createdById: admin.id,
      },
    });
  }

  /** An owner with this name makes the test trigger fail the INSERT (a failure midway). */
  const FAIL_MARKER = '__t9_fail_insert__';
  async function dropFailTrigger() {
    await db.$executeRaw`DROP TRIGGER IF EXISTS t9_fail_insert ON owners`;
    await db.$executeRaw`DROP FUNCTION IF EXISTS t9_fail_insert()`;
  }

  const issuesOf = (preview: { issues: { row: number }[] }, row: number) =>
    preview.issues.find((i) => i.row === row);

  // ---------------------------------------------------------------- lifecycle

  beforeAll(async () => {
    db = createTestDb();
    const { adminRoleId, memberRoleId } = await ensureBuiltInRoles(db);
    admin = await createUserWithToken(db, 't9-admin', adminRoleId, []);
    admin2 = await createUserWithToken(db, 't9-admin2', adminRoleId, []);
    member = await createUserWithToken(db, 't9-member', memberRoleId, []);
    memberB = await createUserWithToken(db, 't9-member-b', memberRoleId, []);
    inactive = await createUserWithToken(db, 't9-off', memberRoleId, []);
    await db.user.update({
      where: { id: inactive.id },
      data: { active: false },
    });
    const importerRole = await db.role.create({
      data: { name: `${run} importer`, permissions: ['owners.import'] },
    });
    const creatorRole = await db.role.create({
      data: { name: `${run} creator`, permissions: ['listings.create'] },
    });
    roles.push(importerRole.id, creatorRole.id);
    importer = await createUserWithToken(db, 't9-importer', importerRole.id, [
      'owners.import',
    ]);
    creator = await createUserWithToken(db, 't9-creator', creatorRole.id, [
      'listings.create',
    ]);
    users.push(
      admin.id,
      admin2.id,
      member.id,
      memberB.id,
      inactive.id,
      importer.id,
      creator.id,
    );

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
      await dropFailTrigger();
      await db.activityEntry.deleteMany({ where: { actorId: where } });
      await db.reminder.deleteMany({
        where: { OR: [{ memberId: where }, { createdById: where }] },
      });
      await db.note.deleteMany({ where: { authorId: where } });
      await db.ownerAssignment.deleteMany({ where: { byId: where } });
      await db.listing.deleteMany({ where: { createdById: where } });
      await db.owner.deleteMany({ where: { createdById: where } });
      await db.importJob.deleteMany({ where: { createdById: where } });
      await db.user.deleteMany({ where: { id: where } });
      await db.role.deleteMany({ where: { id: { in: roles } } });
      await db.$disconnect();
    }
    await app?.close();
  });

  // ================================================================ plan cases

  describe('plan cases', () => {
    it('Member without `owners.import` uploads owners → 403; without `listings.create` uploads listings → 403 (role)', async () => {
      const file = ownersFile([['Sara', randomLocalMobile(), AREA]]);
      const a = await upload(member, 'OWNERS', file).expect(403);
      expect(a.body.error).toBe('FORBIDDEN');
      await upload(creator, 'OWNERS', file).expect(403);
      const b = await upload(
        importer,
        'LISTINGS',
        listingsFile([listingRow(randomLocalMobile())]),
      ).expect(403);
      expect(b.body.error).toBe('FORBIDDEN');
      await upload(
        member,
        'LISTINGS',
        listingsFile([listingRow(randomLocalMobile())]),
      ).expect(403);
      // The right permission for each kind passes.
      await upload(importer, 'OWNERS', file).expect(201);
      await upload(
        creator,
        'LISTINGS',
        listingsFile([listingRow(randomLocalMobile())]),
      ).expect(201);
    });

    it('Wrong file type, > 4 MB, > 20 000 rows, empty sheet → the matching 400 (contract)', async () => {
      const wrongExt = await upload(
        admin,
        'OWNERS',
        Buffer.from('Name,Phone'),
        'owners.txt',
      ).expect(400);
      expect(wrongExt.body.error).toBe('FILE_TYPE');
      const fakeXlsx = await upload(
        admin,
        'OWNERS',
        Buffer.from('Name,Phone\nA,0100'),
        'owners.xlsx',
      ).expect(400);
      expect(fakeXlsx.body.error).toBe('FILE_TYPE');
      const binaryCsv = await upload(
        admin,
        'OWNERS',
        await xlsx([['Name']]),
        'owners.csv',
      ).expect(400);
      expect(binaryCsv.body.error).toBe('FILE_TYPE');

      const big = Buffer.alloc(4 * 1024 * 1024 + 1, 'a');
      const tooLarge = await upload(admin, 'OWNERS', big, 'big.csv').expect(
        400,
      );
      expect(tooLarge.body.error).toBe('FILE_TOO_LARGE');

      const rows: Cell[][] = Array.from({ length: 20_001 }, (_, i) => [
        `Owner ${i}`,
        '01000000000',
      ]);
      const tooMany = await upload(
        admin,
        'OWNERS',
        csv([['Name', 'Phone'], ...rows]),
      ).expect(400);
      expect(tooMany.body.error).toBe('TOO_MANY_ROWS');

      const emptyBook = new ExcelJS.Workbook();
      emptyBook.addWorksheet('Empty');
      const emptySheet = await upload(
        admin,
        'OWNERS',
        Buffer.from(await emptyBook.xlsx.writeBuffer()),
        'empty.xlsx',
      ).expect(400);
      expect(emptySheet.body.error).toBe('EMPTY_FILE');
      const headerOnly = await upload(
        admin,
        'OWNERS',
        csv([
          ['Name', 'Phone'],
          [null, null],
        ]),
      ).expect(400);
      expect(headerOnly.body.error).toBe('EMPTY_FILE');
      const blank = await upload(
        admin,
        'OWNERS',
        Buffer.from(''),
        'blank.csv',
      ).expect(400);
      expect(blank.body.error).toBe('EMPTY_FILE');
    });

    it('Mapping without phone or name → 400 MAPPING_INCOMPLETE (contract)', async () => {
      const up = await upload(
        admin,
        'OWNERS',
        ownersFile([['Sara', randomLocalMobile(), AREA]]),
      ).expect(201);
      const id = up.body.data.id;
      for (const mapping of [{ name: 'Name' }, { phone: 'Phone' }, {}]) {
        const res = await as(admin)
          .post(`/imports/${id}/preview`, { mapping })
          .expect(400);
        expect(res.body.error).toBe('MAPPING_INCOMPLETE');
      }
      const lup = await upload(
        admin,
        'LISTINGS',
        listingsFile([listingRow(randomLocalMobile())]),
      ).expect(201);
      const { sizeSqm: _size, ...noSize } = LISTING_MAPPING;
      const res = await as(admin)
        .post(`/imports/${lup.body.data.id}/preview`, { mapping: noSize })
        .expect(400);
      expect(res.body.error).toBe('MAPPING_INCOMPLETE');
    });

    it('Row whose phone exists as an owner → DUPLICATE with ownerId (flow 1)', async () => {
      const phone = randomLocalMobile();
      const other = randomLocalMobile();
      const existing = await db.owner.create({
        data: {
          name: `${run} existing`,
          createdById: admin.id,
          phones: {
            create: [
              { phone: e164(other), position: 0 },
              { phone: e164(phone), position: 1 },
            ],
          },
        },
      });
      const { preview } = await staged(
        admin,
        'OWNERS',
        ownersFile([['Sara', phone, AREA]]),
        OWNER_MAPPING,
      );
      expect(issuesOf(preview, 1)).toMatchObject({
        reason: 'DUPLICATE',
        field: 'phone',
        value: e164(phone),
        matches: { ownerId: existing.id, listingId: null },
        inTrash: false,
      });
    });

    it("Row whose phone is a listing's owner phone → DUPLICATE with listingId (flow 1)", async () => {
      const phone = randomLocalMobile();
      const listing = await seedListing(phone);
      const { preview } = await staged(
        admin,
        'OWNERS',
        ownersFile([['Sara', phone, AREA]]),
        OWNER_MAPPING,
      );
      expect(issuesOf(preview, 1)).toMatchObject({
        reason: 'DUPLICATE',
        matches: { ownerId: null, listingId: listing.id },
      });
    });

    it('Two rows in the same file with one phone → second is DUPLICATE (contract: within-file)', async () => {
      const phone = randomLocalMobile();
      const { id, preview } = await staged(
        admin,
        'OWNERS',
        ownersFile([
          ['First', phone, AREA],
          ['Second', `+20 ${phone.slice(1)}`, AREA],
        ]),
        OWNER_MAPPING,
      );
      expect(issuesOf(preview, 1)).toBeUndefined();
      expect(issuesOf(preview, 2)).toMatchObject({
        reason: 'DUPLICATE',
        matches: null,
      });
      const done = await as(admin).post(`/imports/${id}/confirm`).expect(200);
      expect(done.body.data.counts).toEqual({
        total: 2,
        added: 1,
        duplicates: 1,
        rejected: 0,
      });
      const owners = await db.owner.findMany({ where: { sourceImportId: id } });
      expect(owners.map((o) => o.name)).toEqual(['First']);
    });

    it('Row with no valid phone → INVALID_PHONE, rejected (flow 1)', async () => {
      const { id, preview } = await staged(
        admin,
        'OWNERS',
        ownersFile([
          ['Bad', '12345', AREA],
          ['Letters', 'call me', AREA],
          ['Good', randomLocalMobile(), AREA],
        ]),
        OWNER_MAPPING,
      );
      expect(issuesOf(preview, 1)).toMatchObject({
        reason: 'INVALID_PHONE',
        field: 'phone',
        value: '12345',
      });
      expect(issuesOf(preview, 2)).toMatchObject({
        reason: 'INVALID_PHONE',
        value: 'call me',
      });
      const done = await as(admin).post(`/imports/${id}/confirm`).expect(200);
      expect(done.body.data.counts).toEqual({
        total: 3,
        added: 1,
        duplicates: 0,
        rejected: 2,
      });
    });

    it('Arabic names and Arabic-Indic digits in phones (٠١٠…) are read correctly (checklist: non-Latin)', async () => {
      const phone = randomLocalMobile();
      const file = csv(
        [
          ['الاسم', 'رقم الهاتف', 'المنطقة'],
          ['محمد عبد الله 🏠', toArabicDigits(phone), AREA],
        ],
        { bom: true },
      );
      const up = await upload(admin, 'OWNERS', file, 'ملاك.csv').expect(201);
      expect(up.body.data.fileName).toBe('ملاك.csv');
      expect(up.body.data.headers).toEqual(['الاسم', 'رقم الهاتف', 'المنطقة']);
      expect(up.body.data.mapping).toEqual({
        name: 'الاسم',
        phone: 'رقم الهاتف',
        area: 'المنطقة',
      });
      const id = up.body.data.id;
      const pv = await as(admin)
        .post(`/imports/${id}/preview`, { mapping: up.body.data.mapping })
        .expect(200);
      expect(pv.body.data.issues).toEqual([]);
      expect(pv.body.data.sample[0]).toMatchObject({
        row: 1,
        name: 'محمد عبد الله 🏠',
      });
      await as(admin).post(`/imports/${id}/confirm`).expect(200);
      const owner = await db.owner.findFirstOrThrow({
        where: { sourceImportId: id },
        include: { phones: true },
      });
      expect(owner.name).toBe('محمد عبد الله 🏠');
      expect(owner.phones.map((p) => p.phone)).toEqual([e164(phone)]);
      expect(latinDigits(toArabicDigits(phone))).toBe(phone);
    });

    it('Phone in Excel stored as a number (leading zero lost: 1001234567) → normalised to +201001234567 (stack: phone never through Number)', async () => {
      const phone = randomLocalMobile();
      const asNumber = Number(phone.slice(1)); // 10xxxxxxxx, as Excel keeps it
      const file = await xlsx([
        ['Name', 'Phone', 'Area'],
        ['Excel owner', asNumber, AREA],
      ]);
      const { id, preview } = await staged(
        admin,
        'OWNERS',
        file,
        OWNER_MAPPING,
        {},
        'owners.xlsx',
      );
      expect(preview.issues).toEqual([]);
      expect(preview.sample[0].phone).toBe(String(asNumber));
      await as(admin).post(`/imports/${id}/confirm`).expect(200);
      const owner = await db.owner.findFirstOrThrow({
        where: { sourceImportId: id },
        include: { phones: true },
      });
      expect(owner.phones[0].phone).toBe(e164(phone));
    });

    it('Owner added between preview and confirm → that row becomes DUPLICATE at confirm (contract: confirm re-checks)', async () => {
      const late = randomLocalMobile();
      const { id, preview } = await staged(
        admin,
        'OWNERS',
        ownersFile([
          ['Late', late, AREA],
          ['Fine', randomLocalMobile(), AREA],
        ]),
        OWNER_MAPPING,
      );
      expect(preview.job.counts).toMatchObject({ added: 2, duplicates: 0 });
      const added = await as(admin)
        .post('/owners', { name: 'Typed by hand', phones: [late] })
        .expect(201);
      const done = await as(admin).post(`/imports/${id}/confirm`).expect(200);
      expect(done.body.data.counts).toEqual({
        total: 2,
        added: 1,
        duplicates: 1,
        rejected: 0,
      });
      const issues = await as(admin).get(`/imports/${id}/issues`).expect(200);
      expect(issues.body.data).toEqual([
        expect.objectContaining({
          row: 1,
          reason: 'DUPLICATE',
          matches: { ownerId: added.body.data.id, listingId: null },
        }),
      ]);
    });

    it('Failure midway through confirm → nothing saved, job FAILED (flow 1: all or nothing)', async () => {
      const marker = FAIL_MARKER;
      await db.$executeRaw`
        CREATE OR REPLACE FUNCTION t9_fail_insert() RETURNS trigger AS $$
        BEGIN
          IF NEW.name = '__t9_fail_insert__' THEN RAISE EXCEPTION 't9 forced failure'; END IF;
          RETURN NEW;
        END $$ LANGUAGE plpgsql`;
      await db.$executeRaw`
        CREATE TRIGGER t9_fail_insert BEFORE INSERT ON owners
        FOR EACH ROW EXECUTE FUNCTION t9_fail_insert()`;
      try {
        const rows: Cell[][] = Array.from({ length: 1500 }, (_, i) => [
          i === 1200 ? marker : `Row ${i}`,
          randomLocalMobile(),
          AREA,
        ]);
        const { id } = await staged(
          admin,
          'OWNERS',
          ownersFile(rows),
          OWNER_MAPPING,
        );
        const before = await db.activityEntry.count({
          where: { actorId: admin.id },
        });
        const res = await as(admin).post(`/imports/${id}/confirm`).expect(500);
        expect(res.body.error).toBe('IMPORT_FAILED');
        expect(await db.owner.count({ where: { sourceImportId: id } })).toBe(0);
        expect(
          await db.activityEntry.count({ where: { actorId: admin.id } }),
        ).toBe(before);
        const job = await db.importJob.findUniqueOrThrow({ where: { id } });
        expect(job.status).toBe('FAILED');
        expect(job.error).toContain('t9 forced failure');
        // A failed import can't be confirmed again without a new preview.
        const again = await as(admin)
          .post(`/imports/${id}/confirm`)
          .expect(409);
        expect(again.body.error).toBe('IMPORT_NOT_PREVIEWED');
      } finally {
        await dropFailTrigger();
      }
    });

    it('Confirm twice → 409 IMPORT_ALREADY_DONE (checklist: wrong state)', async () => {
      const { id } = await staged(
        admin,
        'OWNERS',
        ownersFile([['Once', randomLocalMobile(), AREA]]),
        OWNER_MAPPING,
      );
      await as(admin).post(`/imports/${id}/confirm`).expect(200);
      const res = await as(admin).post(`/imports/${id}/confirm`).expect(409);
      expect(res.body.error).toBe('IMPORT_ALREADY_DONE');
      expect(await db.owner.count({ where: { sourceImportId: id } })).toBe(1);
    });

    it("Another admin's import confirm by a member → 404 (role)", async () => {
      const { id } = await staged(
        admin2,
        'OWNERS',
        ownersFile([['Theirs', randomLocalMobile(), AREA]]),
        OWNER_MAPPING,
      );
      for (const actor of [member, importer, admin]) {
        const res = await as(actor).post(`/imports/${id}/confirm`).expect(404);
        expect(res.body.error).toBe('NOT_FOUND');
        await as(actor)
          .post(`/imports/${id}/preview`, { mapping: OWNER_MAPPING })
          .expect(404);
      }
      await as(member).get(`/imports/${id}/issues`).expect(404);
      // owners.import may read any import's issues.
      await as(importer).get(`/imports/${id}/issues`).expect(200);
      expect(
        (await db.importJob.findUniqueOrThrow({ where: { id } })).status,
      ).toBe('PREVIEWED');
    });

    it('`assignTo` an inactive member → 400 (flow: assign to an active member)', async () => {
      const up = await upload(
        admin,
        'OWNERS',
        ownersFile([['A', randomLocalMobile(), AREA]]),
      ).expect(201);
      const res = await as(admin)
        .post(`/imports/${up.body.data.id}/preview`, {
          mapping: OWNER_MAPPING,
          assignTo: inactive.id,
        })
        .expect(400);
      expect(res.body.error).toBe('INVALID_ASSIGNEE');
      // Deactivated between preview and confirm: refused too, nothing saved, job stays previewed.
      const { id } = await staged(
        admin,
        'OWNERS',
        ownersFile([['B', randomLocalMobile(), AREA]]),
        OWNER_MAPPING,
        { assignTo: memberB.id },
      );
      await db.user.update({
        where: { id: memberB.id },
        data: { active: false },
      });
      try {
        const late = await as(admin).post(`/imports/${id}/confirm`).expect(400);
        expect(late.body.error).toBe('INVALID_ASSIGNEE');
        expect(await db.owner.count({ where: { sourceImportId: id } })).toBe(0);
        expect(
          (await db.importJob.findUniqueOrThrow({ where: { id } })).status,
        ).toBe('PREVIEWED');
      } finally {
        await db.user.update({
          where: { id: memberB.id },
          data: { active: true },
        });
      }
    });

    it('Import writes one activity entry with the counts (business: activity log)', async () => {
      const dup = randomLocalMobile();
      await seedOwner(dup);
      const { id } = await staged(
        importer,
        'OWNERS',
        ownersFile([
          ['A', randomLocalMobile(), AREA],
          ['B', dup, AREA],
          ['C', 'nope', AREA],
        ]),
        OWNER_MAPPING,
        {},
        'march.csv',
      );
      await as(importer).post(`/imports/${id}/confirm`).expect(200);
      const entries = await db.activityEntry.findMany({
        where: { actorId: importer.id, targetId: id },
      });
      expect(entries).toHaveLength(1);
      expect(entries[0]).toMatchObject({
        type: 'IMPORT',
        targetKind: 'IMPORT',
        targetLabel: 'march.csv',
        details: {
          kind: 'OWNERS',
          counts: { total: 3, added: 1, duplicates: 1, rejected: 1 },
          assignToId: null,
        },
      });
      expect(
        await db.activityEntry.count({
          where: { actorId: importer.id, type: 'ASSIGN' },
        }),
      ).toBe(0);
    });

    it('Listings import with a phone matching an owner lead → linked and lead LISTED (flow 5)', async () => {
      const phone = randomLocalMobile();
      const lead = await seedOwner(phone, {
        assignedToId: member.id,
        status: 'INTERESTED',
      });
      const reminder = await db.reminder.create({
        data: {
          ownerId: lead.id,
          memberId: member.id,
          dueAt: new Date(Date.now() + 86_400_000),
          createdById: member.id,
        },
      });
      const { id, preview } = await staged(
        admin,
        'LISTINGS',
        listingsFile([listingRow(phone), listingRow(randomLocalMobile())]),
        LISTING_MAPPING,
        { assignTo: memberB.id },
      );
      expect(preview.issues).toEqual([]);
      const done = await as(admin).post(`/imports/${id}/confirm`).expect(200);
      expect(done.body.data.counts).toEqual({
        total: 2,
        added: 2,
        duplicates: 0,
        rejected: 0,
      });

      const listings = await db.listing.findMany({
        where: { sourceImportId: id },
        orderBy: { ownerPhone: 'asc' },
      });
      expect(listings).toHaveLength(2);
      expect(listings.every((l) => l.assignedToId === memberB.id)).toBe(true);
      const linked = listings.find((l) => l.ownerPhone === e164(phone));
      expect(linked?.ownerId).toBe(lead.id);
      const after = await db.owner.findUniqueOrThrow({
        where: { id: lead.id },
      });
      expect(after).toMatchObject({
        status: 'LISTED',
        assignedToId: memberB.id,
      });
      expect(
        (await db.reminder.findUniqueOrThrow({ where: { id: reminder.id } }))
          .memberId,
      ).toBe(memberB.id);
      expect(
        await db.ownerAssignment.count({
          where: { ownerId: lead.id, toMemberId: memberB.id },
        }),
      ).toBe(1);
      const assign = await db.activityEntry.findMany({
        where: { actorId: admin.id, type: 'ASSIGN', targetId: memberB.id },
      });
      expect(
        assign.some((e) => (e.details as { count: number }).count === 1),
      ).toBe(true);
    });

    it("Listings import row whose phone is another listing's owner phone → DUPLICATE with listingId (decision: duplicate detection)", async () => {
      const phone = randomLocalMobile();
      const listing = await seedListing(phone);
      const listedPhone = randomLocalMobile();
      const listedOwner = await seedOwner(listedPhone, { status: 'LISTED' });
      const ownersListing = await db.listing.create({
        data: {
          purpose: 'RENT',
          type: 'STUDIO',
          area: AREA,
          sizeSqm: 50,
          price: 9000,
          ownerName: 'x',
          ownerPhone: e164(randomLocalMobile()),
          ownerId: listedOwner.id,
          createdById: admin.id,
        },
      });
      const { preview } = await staged(
        creator,
        'LISTINGS',
        listingsFile([listingRow(phone), listingRow(listedPhone)]),
        LISTING_MAPPING,
      );
      expect(issuesOf(preview, 1)).toMatchObject({
        reason: 'DUPLICATE',
        matches: { ownerId: null, listingId: listing.id },
      });
      // An owner lead that already has a live listing (under another phone): duplicate of it.
      expect(issuesOf(preview, 2)).toMatchObject({
        reason: 'DUPLICATE',
        matches: { listingId: ownersListing.id },
      });
    });

    it('Row missing a required field → MISSING_REQUIRED; bad enum/number → INVALID_VALUE (contract)', async () => {
      const { preview } = await staged(
        admin,
        'LISTINGS',
        listingsFile([
          listingRow(randomLocalMobile(), { Purpose: null }),
          listingRow(randomLocalMobile(), { Type: 'castle' }),
          listingRow(randomLocalMobile(), { Price: 'cheap' }),
          listingRow(randomLocalMobile(), { Price: 1500.5 }),
          listingRow(randomLocalMobile(), { Price: 0 }),
          listingRow(randomLocalMobile(), { Size: -3 }),
          listingRow(randomLocalMobile(), {
            Purpose: 'للإيجار',
            Type: 'شقة',
            Price: '٣٬٥٠٠٬٠٠٠',
          }),
          listingRow(randomLocalMobile(), { Owner: '   ' }),
        ]),
        LISTING_MAPPING,
      );
      expect(issuesOf(preview, 1)).toMatchObject({
        reason: 'MISSING_REQUIRED',
        field: 'purpose',
        value: null,
      });
      expect(issuesOf(preview, 2)).toMatchObject({
        reason: 'INVALID_VALUE',
        field: 'type',
        value: 'castle',
      });
      expect(issuesOf(preview, 3)).toMatchObject({
        reason: 'INVALID_VALUE',
        field: 'price',
        value: 'cheap',
      });
      expect(issuesOf(preview, 4)).toMatchObject({
        reason: 'INVALID_VALUE',
        field: 'price',
      });
      expect(issuesOf(preview, 5)).toMatchObject({
        reason: 'INVALID_VALUE',
        field: 'price',
      });
      expect(issuesOf(preview, 6)).toMatchObject({
        reason: 'INVALID_VALUE',
        field: 'sizeSqm',
      });
      expect(issuesOf(preview, 7)).toBeUndefined(); // Arabic purpose, type and digits read fine
      expect(issuesOf(preview, 8)).toMatchObject({
        reason: 'MISSING_REQUIRED',
        field: 'name',
      });

      const owners = await staged(
        admin,
        'OWNERS',
        csv([
          ['Name', 'Phone', 'Area'],
          [null, randomLocalMobile(), AREA],
          ['No phone', null, AREA],
          ['Long area', randomLocalMobile(), 'x'.repeat(101)],
        ]),
        OWNER_MAPPING,
      );
      expect(issuesOf(owners.preview, 1)).toMatchObject({
        reason: 'MISSING_REQUIRED',
        field: 'name',
      });
      expect(issuesOf(owners.preview, 2)).toMatchObject({
        reason: 'MISSING_REQUIRED',
        field: 'phone',
      });
      expect(issuesOf(owners.preview, 3)).toMatchObject({
        reason: 'INVALID_VALUE',
        field: 'area',
      });
    });

    it('added + duplicates + rejected = total (contract: report)', async () => {
      const dup = randomLocalMobile();
      await seedOwner(dup);
      const shared = randomLocalMobile();
      const { id, preview } = await staged(
        admin,
        'OWNERS',
        ownersFile([
          ['A', randomLocalMobile(), AREA],
          ['B', dup, AREA],
          ['C', 'x', AREA],
          [null, randomLocalMobile(), AREA],
          ['E', shared, AREA],
          ['F', shared, AREA],
          ['G', randomLocalMobile(), AREA],
        ]),
        OWNER_MAPPING,
      );
      const check = (c: {
        total: number;
        added: number;
        duplicates: number;
        rejected: number;
      }) => expect(c.added + c.duplicates + c.rejected).toBe(c.total);
      check(preview.job.counts);
      const done = await as(admin).post(`/imports/${id}/confirm`).expect(200);
      expect(done.body.data.counts).toEqual({
        total: 7,
        added: 3,
        duplicates: 2,
        rejected: 2,
      });
      check(done.body.data.counts);
      expect(await db.owner.count({ where: { sourceImportId: id } })).toBe(3);
      const issues = await as(admin)
        .get(`/imports/${id}/issues?limit=20`)
        .expect(200);
      expect(issues.body.meta.total).toBe(4);
    });

    it('Row whose phone belongs to a trashed owner → DUPLICATE with reason in trash (decision)', async () => {
      const phone = randomLocalMobile();
      const trashed = await seedOwner(phone, {
        deletedAt: new Date(),
        deletedById: admin.id,
      });
      const { id, preview } = await staged(
        admin,
        'OWNERS',
        ownersFile([['Back again', phone, AREA]]),
        OWNER_MAPPING,
      );
      expect(issuesOf(preview, 1)).toMatchObject({
        reason: 'DUPLICATE',
        matches: { ownerId: trashed.id, listingId: null },
        inTrash: true,
      });
      // Without trash.restore the trashed owner's id is not told.
      const own = await staged(
        importer,
        'OWNERS',
        ownersFile([['Back again', phone, AREA]]),
        OWNER_MAPPING,
      );
      expect(issuesOf(own.preview, 1)).toMatchObject({
        reason: 'DUPLICATE',
        matches: null,
        inTrash: true,
      });
      // A listing on that phone is a duplicate too (it can't link to a trashed lead).
      const listing = await staged(
        admin,
        'LISTINGS',
        listingsFile([listingRow(phone)]),
        LISTING_MAPPING,
      );
      expect(issuesOf(listing.preview, 1)).toMatchObject({
        reason: 'DUPLICATE',
        inTrash: true,
      });
      const done = await as(admin).post(`/imports/${id}/confirm`).expect(200);
      expect(done.body.data.counts.added).toBe(0);
    });

    it('Preview with `assignTo` by an importer without `owners.assign` → 403 (invariant: only assigners assign)', async () => {
      const up = await upload(
        importer,
        'OWNERS',
        ownersFile([['A', randomLocalMobile(), AREA]]),
      ).expect(201);
      const res = await as(importer)
        .post(`/imports/${up.body.data.id}/preview`, {
          mapping: OWNER_MAPPING,
          assignTo: member.id,
        })
        .expect(403);
      expect(res.body.error).toBe('FORBIDDEN');
      // Without assignTo the same importer previews fine.
      await as(importer)
        .post(`/imports/${up.body.data.id}/preview`, { mapping: OWNER_MAPPING })
        .expect(200);
    });
  });

  // ================================================================ generic checklist

  describe('generic checklist', () => {
    it('no token or an expired token → 401 on every route', async () => {
      const id = '7f1c2a9e-5b8d-4c3e-9a1f-2b3c4d5e6f70';
      const expired = signExpiredToken(admin.claims);
      const routes = [
        () => http().post('/api/imports'),
        () => http().get('/api/imports'),
        () => http().post(`/api/imports/${id}/preview`),
        () => http().post(`/api/imports/${id}/confirm`),
        () => http().get(`/api/imports/${id}/issues`),
      ];
      for (const route of routes) await route().expect(401);
      await http().get('/api/imports').set(bearer(expired)).expect(401);
      await http()
        .post(`/api/imports/${id}/confirm`)
        .set(bearer(expired))
        .expect(401);
    });

    it('upload validation: missing file, missing or unknown kind, extra field → 400', async () => {
      const file = ownersFile([['A', randomLocalMobile(), AREA]]);
      const noFile = await http()
        .post('/api/imports')
        .set(bearer(admin.token))
        .field('kind', 'OWNERS')
        .expect(400);
      expect(noFile.body.error).toBe('VALIDATION_FAILED');
      await http()
        .post('/api/imports')
        .set(bearer(admin.token))
        .attach('file', file, 'a.csv')
        .expect(400);
      await upload(admin, 'PEOPLE', file).expect(400);
      await http()
        .post('/api/imports')
        .set(bearer(admin.token))
        .field('kind', 'OWNERS')
        .field('extra', '1')
        .attach('file', file, 'a.csv')
        .expect(400);
    });

    it('preview validation: body shape, unknown field or column → 400; unknown or malformed id', async () => {
      const up = await upload(
        admin,
        'OWNERS',
        ownersFile([['A', randomLocalMobile(), AREA]]),
      ).expect(201);
      const id = up.body.data.id;
      const bad = [
        {},
        { mapping: 'Name' },
        { mapping: ['Name'] },
        { mapping: { name: 1, phone: 'Phone' } },
        { mapping: { name: '', phone: 'Phone' } },
        { mapping: null },
        { mapping: OWNER_MAPPING, assignTo: 'sara' },
        { mapping: OWNER_MAPPING, assignTo: null },
        { mapping: OWNER_MAPPING, status: 'DONE' },
      ];
      for (const body of bad)
        await as(admin).post(`/imports/${id}/preview`, body).expect(400);
      const unknownField = await as(admin)
        .post(`/imports/${id}/preview`, {
          mapping: { ...OWNER_MAPPING, price: 'Area' },
        })
        .expect(400);
      expect(unknownField.body.error).toBe('MAPPING_INVALID');
      const unknownColumn = await as(admin)
        .post(`/imports/${id}/preview`, {
          mapping: { name: 'Name', phone: 'Mobile' },
        })
        .expect(400);
      expect(unknownColumn.body.error).toBe('MAPPING_INVALID');
      await as(admin)
        .post('/imports/not-a-uuid/preview', { mapping: OWNER_MAPPING })
        .expect(400);
      await as(admin)
        .post('/imports/7f1c2a9e-5b8d-4c3e-9a1f-2b3c4d5e6f70/confirm')
        .expect(404);
      await as(admin)
        .get('/imports/7f1c2a9e-5b8d-4c3e-9a1f-2b3c4d5e6f70/issues')
        .expect(404);
    });

    it('wrong state: confirm before preview → 409 IMPORT_NOT_PREVIEWED; preview after done → 409 IMPORT_NOT_EDITABLE; re-preview replaces the issues', async () => {
      const phone = randomLocalMobile();
      const up = await upload(
        admin,
        'OWNERS',
        ownersFile([
          ['A', phone, AREA],
          ['B', 'bad', AREA],
        ]),
      ).expect(201);
      const id = up.body.data.id;
      const early = await as(admin).post(`/imports/${id}/confirm`).expect(409);
      expect(early.body.error).toBe('IMPORT_NOT_PREVIEWED');

      // First mapping puts the phone column under name: every row then lacks a valid phone.
      const first = await as(admin)
        .post(`/imports/${id}/preview`, {
          mapping: { name: 'Phone', phone: 'Name' },
        })
        .expect(200);
      expect(first.body.data.job.counts).toMatchObject({ rejected: 2 });
      const second = await as(admin)
        .post(`/imports/${id}/preview`, { mapping: OWNER_MAPPING })
        .expect(200);
      expect(second.body.data.job).toMatchObject({
        status: 'PREVIEWED',
        mapping: OWNER_MAPPING,
        counts: { total: 2, added: 1, duplicates: 0, rejected: 1 },
      });
      const issues = await as(admin).get(`/imports/${id}/issues`).expect(200);
      expect(issues.body.data).toHaveLength(1);

      await as(admin).post(`/imports/${id}/confirm`).expect(200);
      const late = await as(admin)
        .post(`/imports/${id}/preview`, { mapping: OWNER_MAPPING })
        .expect(409);
      expect(late.body.error).toBe('IMPORT_NOT_EDITABLE');
    });

    it('two confirms at once → one adds the rows, the other gets 409 (concurrency)', async () => {
      const rows: Cell[][] = Array.from({ length: 50 }, (_, i) => [
        `Twin ${i}`,
        randomLocalMobile(),
        AREA,
      ]);
      const { id } = await staged(
        admin,
        'OWNERS',
        ownersFile(rows),
        OWNER_MAPPING,
      );
      const results = await Promise.all([
        as(admin).post(`/imports/${id}/confirm`),
        as(admin).post(`/imports/${id}/confirm`),
      ]);
      expect(results.map((r) => r.status).sort()).toEqual([200, 409]);
      expect(await db.owner.count({ where: { sourceImportId: id } })).toBe(50);
      expect(
        await db.activityEntry.count({
          where: { targetId: id, type: 'IMPORT' },
        }),
      ).toBe(1);
    });

    it('assignTo a member: owners land assigned, with timeline rows and one ASSIGN entry; source import recorded', async () => {
      const { id } = await staged(
        admin,
        'OWNERS',
        csv([
          ['Name', 'Mobile 1', 'Mobile 2', 'Notes'],
          [
            'Two phones',
            randomLocalMobile(),
            randomLocalMobile(),
            'Met at the open day',
          ],
          ['One phone', randomLocalMobile(), null, null],
        ]),
        { name: 'Name', phone: 'Mobile 1', phone2: 'Mobile 2', note: 'Notes' },
        { assignTo: member.id },
      );
      const done = await as(admin).post(`/imports/${id}/confirm`).expect(200);
      expect(done.body.data).toMatchObject({
        status: 'DONE',
        assignTo: { id: member.id },
      });
      const owners = await db.owner.findMany({
        where: { sourceImportId: id },
        include: { phones: true, notes: true },
        orderBy: { name: 'desc' },
      });
      expect(
        owners.map((o) => [
          o.name,
          o.phones.length,
          o.notes.length,
          o.assignedToId,
          o.status,
        ]),
      ).toEqual([
        ['Two phones', 2, 1, member.id, 'NEW'],
        ['One phone', 1, 0, member.id, 'NEW'],
      ]);
      expect(
        await db.ownerAssignment.count({
          where: {
            ownerId: { in: owners.map((o) => o.id) },
            toMemberId: member.id,
          },
        }),
      ).toBe(2);
      const assign = await db.activityEntry.findMany({
        where: { actorId: admin.id, type: 'ASSIGN', targetId: member.id },
      });
      expect(
        assign.some(
          (e) => (e.details as { count: number; kind: string }).count === 2,
        ),
      ).toBe(true);
      // The member now sees them, filtered by the import.
      const mine = await as(member).get(`/owners?importId=${id}`).expect(200);
      expect(mine.body.meta.total).toBe(2);
      const detail = await as(member)
        .get(`/owners/${owners[0].id}`)
        .expect(200);
      expect(detail.body.data.source).toMatchObject({ importId: id });
    });

    it('formats: .xls (SheetJS), semicolon CSV, extra sheets ignored, blank rows skipped with row numbers kept', async () => {
      const xlsPhone = randomLocalMobile();
      const xlsUp = await upload(
        admin,
        'OWNERS',
        xls([
          ['Name', 'Phone'],
          ['Xls owner', xlsPhone],
        ]),
        'old.xls',
      ).expect(201);
      expect(xlsUp.body.data).toMatchObject({
        headers: ['Name', 'Phone'],
        totalRows: 1,
        mapping: { name: 'Name', phone: 'Phone' },
      });

      const semi = csv(
        [
          ['Name', 'Phone'],
          ['Semi', randomLocalMobile()],
          [null, null],
          ['Colon', 'bad'],
        ],
        { delimiter: ';' },
      );
      const semiJob = await staged(admin, 'OWNERS', semi, {
        name: 'Name',
        phone: 'Phone',
      });
      expect(semiJob.upload.totalRows).toBe(2);
      expect(semiJob.preview.issues).toEqual([
        expect.objectContaining({ row: 3, reason: 'INVALID_PHONE' }),
      ]);

      const book = await xlsx([
        ['Name', 'Phone', 'Name'],
        ['Dup header', randomLocalMobile(), 'x'],
      ]);
      const dupHeaders = await upload(admin, 'OWNERS', book, 'dup.xlsx').expect(
        201,
      );
      expect(dupHeaders.body.data.headers).toEqual([
        'Name',
        'Phone',
        'Name (2)',
      ]);
    });

    it('suggests a mapping from English and Arabic headers', async () => {
      const file = csv([
        [
          'Owner name',
          'Mobile number',
          'رقم 2',
          'District',
          'ملاحظات',
          'Unrelated',
        ],
        ['A', randomLocalMobile(), null, AREA, null, 'x'],
      ]);
      const up = await upload(admin, 'OWNERS', file).expect(201);
      expect(up.body.data.mapping).toEqual({
        name: 'Owner name',
        phone: 'Mobile number',
        phone2: 'رقم 2',
        area: 'District',
        note: 'ملاحظات',
      });
      const listing = await upload(
        creator,
        'LISTINGS',
        csv([
          [
            'اسم المالك',
            'الموبايل',
            'الغرض',
            'نوع العقار',
            'المنطقة',
            'المساحة',
            'السعر',
            'عدد الغرف',
            'Furnished',
          ],
          ['A', randomLocalMobile(), 'بيع', 'فيلا', AREA, 300, 100, 3, 'yes'],
        ]),
      ).expect(201);
      expect(listing.body.data.mapping).toEqual({
        name: 'اسم المالك',
        phone: 'الموبايل',
        purpose: 'الغرض',
        type: 'نوع العقار',
        area: 'المنطقة',
        sizeSqm: 'المساحة',
        price: 'السعر',
        bedrooms: 'عدد الغرف',
        furnishing: 'Furnished',
      });
    });

    it('GET /imports: kinds the caller may import, newest first, paginated; GET issues filters by reason', async () => {
      await upload(
        creator,
        'LISTINGS',
        listingsFile([listingRow(randomLocalMobile())]),
      ).expect(201);
      const mineOnly = await as(creator).get('/imports?limit=20').expect(200);
      expect(
        mineOnly.body.data.every(
          (j: { kind: string }) => j.kind === 'LISTINGS',
        ),
      ).toBe(true);
      await as(creator).get('/imports?kind=OWNERS').expect(403);
      await as(member).get('/imports').expect(403);

      const all = await as(admin).get('/imports?limit=1').expect(200);
      expect(all.body.data).toHaveLength(1);
      expect(all.body.meta.hasNextPage).toBe(true);
      const owners = await as(admin)
        .get('/imports?kind=OWNERS&limit=20')
        .expect(200);
      expect(
        owners.body.data.every((j: { kind: string }) => j.kind === 'OWNERS'),
      ).toBe(true);
      const times = owners.body.data.map(
        (j: { createdAt: string }) => j.createdAt,
      );
      expect([...times].sort().reverse()).toEqual(times);
      for (const q of [
        'page=0',
        'limit=0',
        'limit=21',
        'limit=x',
        'kind=PEOPLE',
        'other=1',
      ]) {
        await as(admin).get(`/imports?${q}`).expect(400);
      }
      const far = await as(admin).get('/imports?page=100000').expect(200);
      expect(far.body.data).toEqual([]);

      const dup = randomLocalMobile();
      await seedOwner(dup);
      const { id } = await staged(
        admin,
        'OWNERS',
        ownersFile([
          ['A', dup, AREA],
          ['B', 'bad', AREA],
          ['C', randomLocalMobile(), AREA],
        ]),
        OWNER_MAPPING,
      );
      const dups = await as(admin)
        .get(`/imports/${id}/issues?reason=DUPLICATE`)
        .expect(200);
      expect(dups.body.data.map((i: { row: number }) => i.row)).toEqual([1]);
      const bad = await as(admin)
        .get(`/imports/${id}/issues?reason=INVALID_PHONE`)
        .expect(200);
      expect(bad.body.data.map((i: { row: number }) => i.row)).toEqual([2]);
      const one = await as(admin)
        .get(`/imports/${id}/issues?limit=1`)
        .expect(200);
      expect(one.body.meta).toMatchObject({ total: 2, hasNextPage: true });
      await as(admin).get(`/imports/${id}/issues?reason=NOPE`).expect(400);
    });
  });

  // ================================================================ performance

  describe('performance', () => {
    it('20 000 owners: upload, preview and confirm well within the function limit (slow)', async () => {
      const base = 1_000_000 + Math.floor(Math.random() * 8_000_000);
      const rows: Cell[][] = [['Name', 'Phone', 'Area']];
      for (let i = 0; i < 20_000; i++) {
        rows.push([
          `${run} bulk ${i}`,
          `0155${String(base + i).padStart(7, '0')}`,
          AREA,
        ]);
      }
      const file = await xlsx(rows);
      const t0 = Date.now();
      const up = await upload(admin, 'OWNERS', file, 'bulk.xlsx').expect(201);
      const t1 = Date.now();
      const id = up.body.data.id;
      const pv = await as(admin)
        .post(`/imports/${id}/preview`, { mapping: OWNER_MAPPING })
        .expect(200);
      const t2 = Date.now();
      const done = await as(admin).post(`/imports/${id}/confirm`).expect(200);
      const t3 = Date.now();
      console.log(
        `[T9 timing] 20000 owners, file ${Math.round(file.length / 1024)} KB: upload ${t1 - t0} ms, preview ${t2 - t1} ms, confirm ${t3 - t2} ms`,
      );
      expect(pv.body.data.job.counts.total).toBe(20_000);
      expect(done.body.data.counts.total).toBe(20_000);
      expect(
        done.body.data.counts.added + done.body.data.counts.duplicates,
      ).toBe(20_000);
      expect(await db.owner.count({ where: { sourceImportId: id } })).toBe(
        done.body.data.counts.added,
      );
      expect(t3 - t2).toBeLessThan(55_000);
    }, 240_000);
  });
});
