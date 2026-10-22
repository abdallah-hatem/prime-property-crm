import { BadRequestException } from '@nestjs/common';
import {
  IMPORT_FILE_EXTENSIONS,
  IMPORT_MAX_ROWS,
  ImportErrorCode,
} from '@prime-crm/shared';
import { parse as parseCsv } from 'csv-parse/sync';
import ExcelJS from 'exceljs';
import * as XLSX from 'xlsx';
import { uniqueHeaders, type Cells, type StagedRow } from './imports.pure';

/**
 * Reads the first sheet of an .xlsx (exceljs), .xls (SheetJS) or .csv (csv-parse) file into
 * header names and data rows of cell texts. Every cell becomes a string here, so a phone never
 * goes through a float: a numeric cell 1001234567 is the text "1001234567".
 */

export interface ParsedFile {
  headers: string[];
  rows: StagedRow[];
}

const fileError = (error: ImportErrorCode, message: string) =>
  new BadRequestException({ message, error });

const notReadable = () =>
  fileError(
    ImportErrorCode.FILE_TYPE,
    'The file must be an Excel (.xlsx, .xls) or CSV file',
  );

type Format = 'xlsx' | 'xls' | 'csv';

const ZIP = [0x50, 0x4b, 0x03, 0x04];
const OLE = [0xd0, 0xcf, 0x11, 0xe0];
const startsWith = (buffer: Buffer, magic: number[]) =>
  magic.every((byte, i) => buffer[i] === byte);

/** The format from the extension, checked against the content (a renamed xlsx still reads). */
export function formatOf(fileName: string, buffer: Buffer): Format {
  const lower = fileName.toLowerCase();
  const ext = IMPORT_FILE_EXTENSIONS.find((e) => lower.endsWith(e));
  if (!ext) throw notReadable();
  if (startsWith(buffer, ZIP)) {
    if (ext === '.csv') throw notReadable();
    return 'xlsx';
  }
  if (startsWith(buffer, OLE)) {
    if (ext === '.csv') throw notReadable();
    return 'xls';
  }
  if (ext !== '.csv') throw notReadable();
  return 'csv';
}

/** A cell value as text. Whole numbers print without exponent or decimals. */
export function cellText(value: unknown): string {
  if (value === null || value === undefined) return '';
  if (typeof value === 'string') return value;
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) return '';
    return Number.isInteger(value) && Math.abs(value) < 1e21
      ? BigInt(value).toString()
      : String(value);
  }
  if (typeof value === 'boolean') return value ? 'TRUE' : 'FALSE';
  if (value instanceof Date) {
    return Number.isNaN(value.getTime())
      ? ''
      : value.toISOString().slice(0, 10);
  }
  if (typeof value === 'object') {
    const v = value as {
      richText?: { text: string }[];
      text?: unknown;
      result?: unknown;
      error?: unknown;
    };
    if (Array.isArray(v.richText))
      return v.richText.map((r) => r.text).join('');
    if ('result' in v) return cellText(v.result);
    if ('error' in v) return '';
    if ('text' in v) return cellText(v.text);
  }
  return '';
}

async function readXlsx(buffer: Buffer): Promise<Cells[]> {
  const workbook = new ExcelJS.Workbook();
  try {
    await workbook.xlsx.load(
      buffer as unknown as Parameters<typeof workbook.xlsx.load>[0],
    );
  } catch {
    throw notReadable();
  }
  const sheet = workbook.worksheets[0];
  if (!sheet) return [];
  const rows: Cells[] = [];
  sheet.eachRow({ includeEmpty: true }, (row, rowNumber) => {
    const values = row.values as unknown[];
    rows[rowNumber - 1] = values.slice(1).map(cellText);
  });
  return Array.from(rows, (r) => r ?? []);
}

function readXls(buffer: Buffer): Cells[] {
  let workbook: XLSX.WorkBook;
  try {
    workbook = XLSX.read(buffer, { type: 'buffer', cellDates: true });
  } catch {
    throw notReadable();
  }
  const sheet = workbook.Sheets[workbook.SheetNames[0]];
  if (!sheet) return [];
  const rows = XLSX.utils.sheet_to_json<unknown[]>(sheet, {
    header: 1,
    raw: true,
    defval: '',
    blankrows: true,
  });
  return rows.map((r) => r.map(cellText));
}

/** UTF-8 (with or without BOM) or UTF-16 (Excel's "Unicode text"), so Arabic survives. */
export function decodeText(buffer: Buffer): string {
  if (buffer[0] === 0xff && buffer[1] === 0xfe) {
    return buffer.subarray(2).toString('utf16le');
  }
  if (buffer[0] === 0xfe && buffer[1] === 0xff) {
    const swapped = Buffer.from(buffer.subarray(2));
    swapped.swap16();
    return swapped.toString('utf16le');
  }
  const text = buffer.toString('utf8');
  return text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
}

/** The delimiter used most on the first line: comma, semicolon or tab. */
function delimiterOf(text: string): string {
  const firstLine = text.slice(0, text.search(/\r?\n|$/));
  const counts = [',', ';', '\t'].map(
    (d) => [d, firstLine.split(d).length] as const,
  );
  return counts.reduce((best, c) => (c[1] > best[1] ? c : best))[0];
}

function readCsv(buffer: Buffer): Cells[] {
  const text = decodeText(buffer);
  if (text.includes('\u0000')) throw notReadable();
  try {
    return parseCsv(text, {
      delimiter: delimiterOf(text),
      relax_column_count: true,
      relax_quotes: true,
      skip_empty_lines: false,
    });
  } catch {
    throw notReadable();
  }
}

const isBlank = (cells: Cells) => cells.every((c) => c.trim() === '');

/**
 * Headers and data rows of the file. The header is the first non-blank row; blank rows are
 * skipped but keep their place, so `rowNumber` (1 = the first row under the header) matches
 * what the user sees in the sheet minus the header line.
 */
export async function parseImportFile(
  fileName: string,
  buffer: Buffer,
): Promise<ParsedFile> {
  const format = formatOf(fileName, buffer);
  const all =
    format === 'xlsx'
      ? await readXlsx(buffer)
      : format === 'xls'
        ? readXls(buffer)
        : readCsv(buffer);

  const headerAt = all.findIndex((cells) => !isBlank(cells));
  if (headerAt === -1) {
    throw fileError(ImportErrorCode.EMPTY_FILE, 'The file has no rows');
  }
  const rawHeaders = all[headerAt];
  let width = rawHeaders.length;
  while (width > 0 && rawHeaders[width - 1].trim() === '') width--;
  const headers = uniqueHeaders(rawHeaders.slice(0, width));

  const rows: StagedRow[] = [];
  for (let i = headerAt + 1; i < all.length; i++) {
    const cells = all[i].slice(0, width);
    if (isBlank(cells)) continue;
    rows.push({ rowNumber: i - headerAt, cells });
    if (rows.length > IMPORT_MAX_ROWS) {
      throw fileError(
        ImportErrorCode.TOO_MANY_ROWS,
        `The file has more than ${IMPORT_MAX_ROWS} rows`,
      );
    }
  }
  if (rows.length === 0) {
    throw fileError(ImportErrorCode.EMPTY_FILE, 'The file has no data rows');
  }
  return { headers, rows };
}
