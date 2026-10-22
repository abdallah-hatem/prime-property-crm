import {
  checkListingRow,
  checkOwnerRow,
  checkRows,
  classifyRows,
  columnsOf,
  countsOf,
  mappingProblem,
  normalizeLabel,
  parseNumber,
  phonesOf,
  suggestMapping,
  uniqueHeaders,
  type PhoneLookup,
} from './imports.pure';

const OWNER_HEADERS = ['Name', 'Phone', 'Phone 2', 'Area', 'Notes'];
const OWNER_COLUMNS = columnsOf(
  {
    name: 'Name',
    phone: 'Phone',
    phone2: 'Phone 2',
    area: 'Area',
    note: 'Notes',
  },
  OWNER_HEADERS,
);
const LISTING_HEADERS = [
  'Owner',
  'Phone',
  'Purpose',
  'Type',
  'Area',
  'Size',
  'Price',
  'Furnishing',
];
const LISTING_COLUMNS = columnsOf(
  {
    name: 'Owner',
    phone: 'Phone',
    purpose: 'Purpose',
    type: 'Type',
    area: 'Area',
    sizeSqm: 'Size',
    price: 'Price',
    furnishing: 'Furnishing',
  },
  LISTING_HEADERS,
);
const listing = (over: Partial<Record<string, string>> = {}) => {
  const row: Record<string, string> = {
    Owner: 'Hany',
    Phone: '01001234567',
    Purpose: 'sale',
    Type: 'Apartment',
    Area: 'Maadi',
    Size: '120',
    Price: '2,500,000',
    Furnishing: '',
    ...over,
  };
  return LISTING_HEADERS.map((h) => row[h]);
};

const emptyLookup = (): PhoneLookup => ({
  owners: new Map(),
  listings: new Map(),
});

describe('headers and mapping', () => {
  it('normalises Arabic letter variants, diacritics and punctuation', () => {
    expect(normalizeLabel('  رقم الهاتف ')).toBe('رقمالهاتف');
    expect(normalizeLabel('المِنطقة')).toBe('المنطقه');
    expect(normalizeLabel('إيجار')).toBe('ايجار');
    expect(normalizeLabel('Mobile_No.')).toBe('mobileno');
  });

  it('names empty headers and numbers repeated ones', () => {
    expect(uniqueHeaders([' Name ', '', 'Name', 'Name'])).toEqual([
      'Name',
      'Column 2',
      'Name (2)',
      'Name (3)',
    ]);
  });

  it('suggests owners fields from English and Arabic headers, a second phone column → phone2', () => {
    expect(
      suggestMapping('OWNERS', [
        'الاسم',
        'موبايل',
        'Mobile',
        'tel 3',
        'Price',
        'الحي',
      ]),
    ).toEqual({
      name: 'الاسم',
      phone: 'موبايل',
      phone2: 'Mobile',
      phone3: 'tel 3',
      area: 'الحي',
    });
  });

  it('suggests listing fields only (no phone2 for listings)', () => {
    expect(
      suggestMapping('LISTINGS', [
        'Owner Name',
        'Phone',
        'Phone 2',
        'For',
        'Property type',
        'Area (sqm)',
        'Asking price',
      ]),
    ).toEqual({
      name: 'Owner Name',
      phone: 'Phone',
      purpose: 'For',
      type: 'Property type',
      sizeSqm: 'Area (sqm)',
      price: 'Asking price',
    });
  });

  it('mappingProblem: unknown field, unknown column, missing required fields', () => {
    const headers = ['Name', 'Phone'];
    expect(
      mappingProblem('OWNERS', { name: 'Name', phone: 'Phone' }, headers),
    ).toBeNull();
    expect(
      mappingProblem('OWNERS', { name: 'Name', price: 'Phone' }, headers),
    ).toMatchObject({ code: 'MAPPING_INVALID' });
    expect(
      mappingProblem('OWNERS', { name: 'Name', phone: 'Mobile' }, headers),
    ).toMatchObject({ code: 'MAPPING_INVALID' });
    expect(mappingProblem('OWNERS', { name: 'Name' }, headers)).toEqual({
      code: 'MAPPING_INCOMPLETE',
      missing: ['phone'],
    });
    expect(
      mappingProblem('LISTINGS', { name: 'Name', phone: 'Phone' }, headers),
    ).toEqual({
      code: 'MAPPING_INCOMPLETE',
      missing: ['purpose', 'type', 'area', 'sizeSqm', 'price'],
    });
  });
});

describe('checkOwnerRow', () => {
  it('reads an owner with two phones, dropping a repeated one', () => {
    const result = checkOwnerRow(
      ['  Sara ', '1001234567', '+20 100 123 4567', 'Maadi', 'note'],
      OWNER_COLUMNS,
    );
    expect(result).toEqual({
      ok: true,
      phones: ['+201001234567'],
      value: {
        name: 'Sara',
        phones: ['+201001234567'],
        area: 'Maadi',
        note: 'note',
      },
    });
  });

  it.each([
    [['', '01001234567', '', '', ''], 'MISSING_REQUIRED', 'name'],
    [['Sara', ' ', '', '', ''], 'MISSING_REQUIRED', 'phone'],
    [['Sara', '0100', '', '', ''], 'INVALID_PHONE', 'phone'],
    [['Sara', '01001234567', 'x', '', ''], 'INVALID_PHONE', 'phone2'],
    [['n'.repeat(201), '01001234567', '', '', ''], 'INVALID_VALUE', 'name'],
    [['Sara', '01001234567', '', 'a'.repeat(101), ''], 'INVALID_VALUE', 'area'],
    [
      ['Sara', '01001234567', '', '', 'n'.repeat(2001)],
      'INVALID_VALUE',
      'note',
    ],
  ])('%j → %s on %s', (cells, reason, field) => {
    const result = checkOwnerRow(cells, OWNER_COLUMNS);
    expect(result).toMatchObject({ ok: false, issue: { reason, field } });
  });

  it('reads Arabic-Indic digits', () => {
    expect(
      checkOwnerRow(['أحمد', '٠١٠٠١٢٣٤٥٦٧', '', '', ''], OWNER_COLUMNS),
    ).toMatchObject({
      ok: true,
      phones: ['+201001234567'],
    });
  });
});

describe('checkListingRow (POST /listings validation)', () => {
  it('reads English and Arabic words and formatted numbers', () => {
    expect(checkListingRow(listing(), LISTING_COLUMNS)).toMatchObject({
      ok: true,
      value: {
        purpose: 'SALE',
        type: 'APARTMENT',
        price: 2_500_000,
        sizeSqm: 120,
        furnishing: null,
      },
    });
    expect(
      checkListingRow(
        listing({
          Purpose: 'للإيجار',
          Type: 'توين هاوس',
          Price: '٣٬٥٠٠٬٠٠٠',
          Furnishing: 'نصف مفروش',
        }),
        LISTING_COLUMNS,
      ),
    ).toMatchObject({
      ok: true,
      value: {
        purpose: 'RENT',
        type: 'TWIN_HOUSE',
        price: 3_500_000,
        furnishing: 'SEMI_FURNISHED',
      },
    });
    expect(
      checkListingRow(listing({ Type: 'twin_house' }), LISTING_COLUMNS),
    ).toMatchObject({
      ok: true,
      value: { type: 'TWIN_HOUSE' },
    });
  });

  it.each([
    [{ Purpose: '' }, 'MISSING_REQUIRED', 'purpose'],
    [{ Size: '' }, 'MISSING_REQUIRED', 'sizeSqm'],
    [{ Phone: '123' }, 'INVALID_PHONE', 'phone'],
    [{ Purpose: 'swap' }, 'INVALID_VALUE', 'purpose'],
    [{ Type: 'castle' }, 'INVALID_VALUE', 'type'],
    [{ Furnishing: 'maybe' }, 'INVALID_VALUE', 'furnishing'],
    [{ Price: 'cheap' }, 'INVALID_VALUE', 'price'],
    [{ Price: '1500.5' }, 'INVALID_VALUE', 'price'],
    [{ Price: '0' }, 'INVALID_VALUE', 'price'],
    [{ Price: '1000000001' }, 'INVALID_VALUE', 'price'],
    [{ Size: '-1' }, 'INVALID_VALUE', 'sizeSqm'],
    [{ Owner: 'n'.repeat(201) }, 'INVALID_VALUE', 'name'],
  ])('%j → %s on %s', (over, reason, field) => {
    expect(checkListingRow(listing(over), LISTING_COLUMNS)).toMatchObject({
      ok: false,
      issue: { reason, field },
    });
  });

  it('parseNumber accepts separators and Arabic digits, refuses words', () => {
    expect(parseNumber('1,250,000')).toBe(1_250_000);
    expect(parseNumber('١٢٠')).toBe(120);
    expect(parseNumber('12٫5')).toBe(12.5);
    expect(parseNumber('-2')).toBe(-2);
    expect(parseNumber('2M')).toBeNaN();
  });
});

describe('classifyRows', () => {
  const owner = (name: string, phone: string) => ({
    rowNumber: 0,
    cells: [name, phone, '', '', ''],
  });
  const rows = (...r: { cells: string[] }[]) =>
    r.map((x, i) => ({ rowNumber: i + 1, cells: x.cells }));

  it('owners: DB owner (trashed too), live listing, earlier row → DUPLICATE; others added', () => {
    const lookup = emptyLookup();
    lookup.owners.set('+201001111111', {
      ownerId: 'o1',
      deleted: false,
      assignedToId: null,
      listingId: null,
    });
    lookup.owners.set('+201002222222', {
      ownerId: 'o2',
      deleted: true,
      assignedToId: null,
      listingId: null,
    });
    lookup.listings.set('+201003333333', 'l1');
    const checked = checkRows(
      'OWNERS',
      rows(
        owner('A', '01001111111'),
        owner('B', '01002222222'),
        owner('C', '01003333333'),
        owner('D', '01004444444'),
        owner('E', '01004444444'),
        owner('', '01005555555'),
        owner('G', '01005555555'),
      ),
      OWNER_COLUMNS,
    );
    expect(phonesOf(checked)).toHaveLength(5);
    const out = classifyRows('OWNERS', checked, lookup);
    expect(
      out.map(
        (r) =>
          r.issue && [
            r.issue.reason,
            r.issue.ownerId,
            r.issue.listingId,
            r.issue.inTrash,
          ],
      ),
    ).toEqual([
      ['DUPLICATE', 'o1', null, false],
      ['DUPLICATE', 'o2', null, true],
      ['DUPLICATE', null, 'l1', false],
      null,
      ['DUPLICATE', null, null, false],
      ['MISSING_REQUIRED', null, null, false],
      null, // the rejected row 6 doesn't claim its phone
    ]);
    expect(countsOf(out)).toEqual({
      total: 7,
      added: 2,
      duplicates: 4,
      rejected: 1,
    });
  });

  it('listings: an owner lead links (once); a listed or trashed owner is a duplicate', () => {
    const lookup = emptyLookup();
    lookup.owners.set('+201001111111', {
      ownerId: 'lead',
      deleted: false,
      assignedToId: 'm1',
      listingId: null,
    });
    lookup.owners.set('+201001111112', {
      ownerId: 'lead',
      deleted: false,
      assignedToId: 'm1',
      listingId: null,
    });
    lookup.owners.set('+201002222222', {
      ownerId: 'listed',
      deleted: false,
      assignedToId: null,
      listingId: 'l9',
    });
    const staged = [
      listing({ Phone: '01001111111' }),
      listing({ Phone: '01001111112' }),
      listing({ Phone: '01002222222' }),
    ].map((cells, i) => ({ rowNumber: i + 1, cells }));
    const out = classifyRows(
      'LISTINGS',
      checkRows('LISTINGS', staged, LISTING_COLUMNS),
      lookup,
    );
    expect(out[0]).toMatchObject({ issue: null, link: { ownerId: 'lead' } });
    expect(out[1].issue).toMatchObject({
      reason: 'DUPLICATE',
      ownerId: null,
      listingId: null,
    });
    expect(out[2].issue).toMatchObject({
      reason: 'DUPLICATE',
      ownerId: 'listed',
      listingId: 'l9',
    });
  });
});
