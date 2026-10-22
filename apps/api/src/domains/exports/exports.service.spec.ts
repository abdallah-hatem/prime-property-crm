import { BadRequestException } from '@nestjs/common';
import type { OwnerRow } from '@prime-crm/shared';
import { ValueType, Workbook } from 'exceljs';
import type { CurrentUser } from '../../common/interfaces/current-user.interface';
import { ExportsService } from './exports.service';
import { cairoStamp, ownersWorkbook } from './exports.workbook';

const NOW = new Date('2026-10-22T21:30:00Z'); // 23 Oct in Cairo
const TX = { tx: true };
const admin: CurrentUser = {
  id: 'admin',
  roleId: 'r',
  permissions: [],
  isAdmin: true,
};

const ROW: OwnerRow = {
  id: 'o1',
  name: 'Sara',
  phones: ['+201001234567', '+20225551234'],
  area: 'Maadi',
  status: 'NEW',
  assignedTo: { id: 'm1', name: 'Omar' },
  lastCall: null,
  nextReminderAt: null,
  createdAt: '2026-10-01T09:00:00.000Z',
};

function makeService(over: { total?: number; rows?: OwnerRow[] } = {}) {
  const owners = {
    exportRows: jest.fn().mockResolvedValue({
      total: over.total ?? 1,
      rows: over.rows ?? [ROW],
    }),
  };
  const listings = {
    exportRows: jest.fn().mockResolvedValue({ total: 0, rows: [] }),
  };
  const activity = { record: jest.fn().mockResolvedValue(undefined) };
  const db = {
    transaction: jest.fn((work: (tx: unknown) => unknown) => work(TX)),
  };
  const users = { languageOf: jest.fn().mockResolvedValue('en') };
  const svc = new ExportsService(
    db as never,
    owners as never,
    listings as never,
    users as never,
    activity as never,
    { now: () => NOW },
  );
  return { svc, owners, listings, activity };
}

async function load(buffer: Buffer) {
  const wb = new Workbook();
  await wb.xlsx.load(buffer as unknown as ArrayBuffer);
  return wb.worksheets[0];
}

describe('ExportsService', () => {
  it('Export as member → 403 (role); export respects filters; > 50 000 rows → 400 (contract)', async () => {
    const { svc, owners, activity } = makeService({ total: 50_001, rows: [] });
    const query = { area: 'Maadi', status: ['NEW' as const] };
    await expect(svc.exportOwners(query, admin)).rejects.toThrow(
      BadRequestException,
    );
    await expect(svc.exportOwners(query, admin)).rejects.toMatchObject({
      response: { error: 'EXPORT_TOO_LARGE' },
    });
    // The list's filters go through as given, capped at 50 000.
    expect(owners.exportRows).toHaveBeenCalledWith(query, admin, 50_000);
    expect(activity.record).not.toHaveBeenCalled();
  });

  it('Export writes an activity entry (business: activity log)', async () => {
    const { svc, activity } = makeService();
    const file = await svc.exportOwners({ area: 'Maadi' }, admin);
    expect(file.fileName).toBe('owners-2026-10-23.xlsx');
    expect(activity.record).toHaveBeenCalledWith(TX, {
      type: 'EXPORT',
      actorId: 'admin',
      summary: 'Exported 1 owners',
      details: { kind: 'OWNERS', count: 1, filters: { area: 'Maadi' } },
    });
    const listings = await svc.exportListings({}, admin);
    expect(listings.fileName).toBe('listings-2026-10-23.xlsx');
    expect(activity.record).toHaveBeenLastCalledWith(
      TX,
      expect.objectContaining({
        details: { kind: 'LISTINGS', count: 0, filters: {} },
      }),
    );
  });
});

describe('exports.workbook', () => {
  it('Export file phone column as text (leading `+` kept) (checklist: phone format)', async () => {
    const ws = await load(await ownersWorkbook([ROW], 'en'));
    expect(ws.getRow(1).getCell(1).value).toBe('Name');
    for (const [col, phone] of [
      [2, '+201001234567'],
      [3, '+20225551234'],
    ] as const) {
      const cell = ws.getRow(2).getCell(col);
      expect(cell.type).toBe(ValueType.String);
      expect(cell.value).toBe(phone);
      expect(cell.numFmt).toBe('@');
    }
    expect(ws.getRow(2).getCell(6).value).toBe('New');
  });

  it('Arabic: headers, labels and a right-to-left sheet', async () => {
    const ws = await load(await ownersWorkbook([ROW], 'ar'));
    expect(ws.getRow(1).getCell(1).value).toBe('الاسم');
    expect(ws.getRow(2).getCell(6).value).toBe('جديد');
    expect(ws.views[0]).toMatchObject({ rightToLeft: true });
  });

  it('times are Cairo local', () => {
    expect(cairoStamp('2026-10-22T21:30:00Z')).toBe('2026-10-23 00:30');
    expect(cairoStamp(new Date('2025-03-10T08:05:00Z'))).toBe(
      '2025-03-10 10:05',
    );
    expect(cairoStamp(null)).toBeNull();
  });
});
