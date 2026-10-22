import {
  FURNISHING_LABELS,
  LISTING_EXPORT_HEADERS,
  LISTING_PURPOSE_LABELS,
  messages,
  OWNER_EXPORT_HEADERS,
  propertyTypeLabel,
  type Language,
  type OwnerRow,
} from '@prime-crm/shared';
import { Workbook, type Worksheet } from 'exceljs';
import { CAIRO_TIME_ZONE } from '../../common/utils/cairo-date.util';
import type { ListingExportRow } from '../listings/interfaces/listing.interface';

type Cell = string | number | null;

/** Text format: Excel keeps `+201001234567` as typed instead of turning it into a number. */
const TEXT = '@';

const cairoDateTime = new Intl.DateTimeFormat('en-CA', {
  timeZone: CAIRO_TIME_ZONE,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  hourCycle: 'h23',
});

/** `2026-10-23 14:05`, Cairo local time (the sheet has no time zone). */
export function cairoStamp(at: Date | string | null): string | null {
  if (at === null) return null;
  const parts = Object.fromEntries(
    cairoDateTime
      .formatToParts(typeof at === 'string' ? new Date(at) : at)
      .map((p) => [p.type, p.value]),
  );
  return `${parts.year}-${parts.month}-${parts.day} ${parts.hour}:${parts.minute}`;
}

interface Column {
  header: Record<Language, string>;
  /** Phone columns are text. */
  text?: boolean;
  width: number;
}

function sheet(
  workbook: Workbook,
  name: string,
  columns: Column[],
  rows: Cell[][],
  language: Language,
): Worksheet {
  const ws = workbook.addWorksheet(name, {
    views: [{ state: 'frozen', ySplit: 1, rightToLeft: language === 'ar' }],
  });
  ws.columns = columns.map((c) => ({
    header: c.header[language],
    width: c.width,
    ...(c.text ? { style: { numFmt: TEXT } } : {}),
  }));
  ws.getRow(1).font = { bold: true };
  for (const values of rows) {
    const row = ws.addRow(values);
    columns.forEach((c, i) => {
      if (c.text) row.getCell(i + 1).numFmt = TEXT;
    });
  }
  return ws;
}

async function toBuffer(workbook: Workbook): Promise<Buffer> {
  return Buffer.from(await workbook.xlsx.writeBuffer());
}

/** The owners sheet: up to three phones as text, labels in `language`. */
export function ownersWorkbook(
  rows: OwnerRow[],
  language: Language,
): Promise<Buffer> {
  const h = OWNER_EXPORT_HEADERS;
  const phone = { text: true, width: 18 };
  const columns: Column[] = [
    { header: h.name, width: 28 },
    { header: h.phone1, ...phone },
    { header: h.phone2, ...phone },
    { header: h.phone3, ...phone },
    { header: h.area, width: 20 },
    { header: h.status, width: 16 },
    { header: h.assignedTo, width: 22 },
    { header: h.lastCallAt, width: 18 },
    { header: h.lastOutcome, width: 22 },
    { header: h.nextReminderAt, width: 18 },
    { header: h.createdAt, width: 18 },
  ];
  const status = messages[language].leadStatus;
  const workbook = new Workbook();
  sheet(
    workbook,
    language === 'ar' ? 'الملاك' : 'Owners',
    columns,
    rows.map((r) => [
      r.name,
      r.phones[0] ?? null,
      r.phones[1] ?? null,
      r.phones[2] ?? null,
      r.area,
      status[r.status],
      r.assignedTo?.name ?? null,
      cairoStamp(r.lastCall?.at ?? null),
      r.lastCall?.outcome.label ?? null,
      cairoStamp(r.nextReminderAt),
      cairoStamp(r.createdAt),
    ]),
    language,
  );
  return toBuffer(workbook);
}

/** The listings sheet: the owner phone as text (empty where the caller may not see it). */
export function listingsWorkbook(
  rows: ListingExportRow[],
  language: Language,
): Promise<Buffer> {
  const h = LISTING_EXPORT_HEADERS;
  const columns: Column[] = [
    { header: h.title, width: 32 },
    { header: h.purpose, width: 10 },
    { header: h.type, width: 14 },
    { header: h.area, width: 20 },
    { header: h.compound, width: 20 },
    { header: h.address, width: 28 },
    { header: h.price, width: 14 },
    { header: h.sizeSqm, width: 10 },
    { header: h.bedrooms, width: 10 },
    { header: h.bathrooms, width: 10 },
    { header: h.floor, width: 8 },
    { header: h.furnishing, width: 16 },
    { header: h.status, width: 14 },
    { header: h.adStatus, width: 14 },
    { header: h.adLink, width: 40 },
    { header: h.ownerName, width: 24 },
    { header: h.ownerPhone, text: true, width: 18 },
    { header: h.assignedTo, width: 22 },
    { header: h.createdAt, width: 18 },
  ];
  const m = messages[language];
  const workbook = new Workbook();
  sheet(
    workbook,
    language === 'ar' ? 'العقارات' : 'Listings',
    columns,
    rows.map((r) => [
      r.title,
      LISTING_PURPOSE_LABELS[r.purpose][language],
      propertyTypeLabel(r.type, language),
      r.area,
      r.compound,
      r.address,
      r.price,
      r.sizeSqm,
      r.bedrooms,
      r.bathrooms,
      r.floor,
      r.furnishing ? FURNISHING_LABELS[r.furnishing][language] : null,
      m.listingStatus[r.status],
      m.adStatus[r.adStatus],
      r.adLink,
      r.ownerName,
      r.ownerPhone,
      r.assignedTo?.name ?? null,
      cairoStamp(r.createdAt),
    ]),
    language,
  );
  return toBuffer(workbook);
}
