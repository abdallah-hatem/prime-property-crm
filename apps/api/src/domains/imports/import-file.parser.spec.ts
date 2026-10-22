import { BadRequestException } from '@nestjs/common';
import ExcelJS from 'exceljs';
import * as XLSX from 'xlsx';
import {
  cellText,
  decodeText,
  formatOf,
  parseImportFile,
} from './import-file.parser';

async function codeOf(work: Promise<unknown>): Promise<string> {
  try {
    await work;
  } catch (error) {
    expect(error).toBeInstanceOf(BadRequestException);
    return ((error as BadRequestException).getResponse() as { error: string })
      .error;
  }
  throw new Error('expected a 400');
}

describe('cellText', () => {
  it('keeps whole numbers whole (a phone that lost its 0 stays all digits)', () => {
    expect(cellText(1001234567)).toBe('1001234567');
    expect(cellText(201001234567)).toBe('201001234567');
    expect(cellText(1e20)).toBe('100000000000000000000');
    expect(cellText(12.5)).toBe('12.5');
  });

  it('reads rich text, formulas, hyperlinks, dates, booleans and empties', () => {
    expect(cellText({ richText: [{ text: 'Sa' }, { text: 'ra' }] })).toBe(
      'Sara',
    );
    expect(cellText({ formula: 'A1', result: 42 })).toBe('42');
    expect(cellText({ text: 'link', hyperlink: 'https://x' })).toBe('link');
    expect(cellText({ error: '#N/A' })).toBe('');
    expect(cellText(new Date('2026-10-23T00:00:00Z'))).toBe('2026-10-23');
    expect(cellText(true)).toBe('TRUE');
    expect(cellText(null)).toBe('');
    expect(cellText(Number.NaN)).toBe('');
  });
});

describe('decodeText', () => {
  it('UTF-8 with or without BOM, and UTF-16 LE', () => {
    expect(decodeText(Buffer.from('﻿الاسم', 'utf8'))).toBe('الاسم');
    expect(decodeText(Buffer.from('الاسم', 'utf8'))).toBe('الاسم');
    const utf16 = Buffer.concat([
      Buffer.from([0xff, 0xfe]),
      Buffer.from('الاسم', 'utf16le'),
    ]);
    expect(decodeText(utf16)).toBe('الاسم');
  });
});

describe('formatOf', () => {
  it('trusts the content over the extension, refuses other files', () => {
    const zip = Buffer.from([0x50, 0x4b, 0x03, 0x04, 0]);
    const ole = Buffer.from([0xd0, 0xcf, 0x11, 0xe0, 0]);
    expect(formatOf('a.XLSX', zip)).toBe('xlsx');
    expect(formatOf('a.xls', zip)).toBe('xlsx');
    expect(formatOf('a.xls', ole)).toBe('xls');
    expect(formatOf('a.csv', Buffer.from('a,b'))).toBe('csv');
    expect(() => formatOf('a.txt', Buffer.from('a,b'))).toThrow(
      BadRequestException,
    );
    expect(() => formatOf('a.xlsx', Buffer.from('a,b'))).toThrow(
      BadRequestException,
    );
    expect(() => formatOf('a.csv', zip)).toThrow(BadRequestException);
  });
});

describe('parseImportFile', () => {
  it('xlsx: first sheet only, header row found, blank rows skipped with numbers kept', async () => {
    const book = new ExcelJS.Workbook();
    const sheet = book.addWorksheet('One');
    sheet.addRow([]);
    sheet.addRow(['Name', 'Phone', '']);
    sheet.addRow(['Sara', 1001234567]);
    sheet.addRow([]);
    sheet.addRow(['Omar', '01101234567', 'beyond header']);
    book.addWorksheet('Two').addRow(['ignored']);
    const parsed = await parseImportFile(
      'x.xlsx',
      Buffer.from(await book.xlsx.writeBuffer()),
    );
    expect(parsed.headers).toEqual(['Name', 'Phone']);
    expect(parsed.rows).toEqual([
      { rowNumber: 1, cells: ['Sara', '1001234567'] },
      { rowNumber: 3, cells: ['Omar', '01101234567'] },
    ]);
  });

  it('xls through SheetJS', async () => {
    const book = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(
      book,
      XLSX.utils.aoa_to_sheet([
        ['Name', 'Phone'],
        ['سارة', 1001234567],
      ]),
      'S',
    );
    const buffer = XLSX.write(book, {
      type: 'buffer',
      bookType: 'biff8',
    }) as Buffer;
    const parsed = await parseImportFile('x.xls', buffer);
    expect(parsed.rows).toEqual([
      { rowNumber: 1, cells: ['سارة', '1001234567'] },
    ]);
  });

  it('csv: quoted values, semicolons, tabs, BOM', async () => {
    const parsed = await parseImportFile(
      'x.csv',
      Buffer.from('﻿Name;Price\r\n"Sara; Ali";"2,500"\r\n', 'utf8'),
    );
    expect(parsed).toEqual({
      headers: ['Name', 'Price'],
      rows: [{ rowNumber: 1, cells: ['Sara; Ali', '2,500'] }],
    });
    const tabs = await parseImportFile(
      'x.csv',
      Buffer.from('Name\tPhone\nA\t010\n'),
    );
    expect(tabs.rows[0].cells).toEqual(['A', '010']);
  });

  it('EMPTY_FILE, TOO_MANY_ROWS and FILE_TYPE', async () => {
    expect(await codeOf(parseImportFile('x.csv', Buffer.from('\n\n')))).toBe(
      'EMPTY_FILE',
    );
    expect(
      await codeOf(parseImportFile('x.csv', Buffer.from('Name,Phone\n,\n'))),
    ).toBe('EMPTY_FILE');
    const many = `Name\n${'a\n'.repeat(20_001)}`;
    expect(await codeOf(parseImportFile('x.csv', Buffer.from(many)))).toBe(
      'TOO_MANY_ROWS',
    );
    expect(
      await codeOf(parseImportFile('x.csv', Buffer.from('a\u0000b'))),
    ).toBe('FILE_TYPE');
    expect(
      await codeOf(
        parseImportFile('x.xlsx', Buffer.from([0x50, 0x4b, 0x03, 0x04, 1, 2])),
      ),
    ).toBe('FILE_TYPE');
  });
});
