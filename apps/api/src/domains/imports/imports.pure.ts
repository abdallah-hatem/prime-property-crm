import {
  AREA_MAX_LENGTH,
  FurnishingSchema,
  IMPORT_REQUIRED_FIELDS,
  importFieldsOf,
  latinDigits,
  NOTE_BODY_MAX_LENGTH,
  OWNER_NAME_MAX_LENGTH,
  PropertyTypeSchema,
  propertyTypeLabel,
  toE164,
  type Furnishing,
  type ImportCounts,
  type ImportField,
  type ImportIssueReason,
  type ImportKind,
  type ImportMapping,
  type ListingPurpose,
  type PropertyType,
} from '@prime-crm/shared';
import { plainToInstance } from 'class-transformer';
import { validateSync } from 'class-validator';
import { CreateListingDto } from '../listings/dto/create-listing.dto';

/**
 * The import rules that need no I/O: header names → suggested mapping, a staged row → an owner
 * or listing candidate (or the reason it is rejected), duplicate detection against what the
 * database holds and earlier rows of the same file, and the counts.
 */

/** One data row as staged: the cell texts, column by column (phones never go through Number). */
export type Cells = string[];

// ------------------------------------------------------------------ headers

/** Lower case, Arabic letter variants folded, diacritics, spaces and punctuation dropped. */
export function normalizeLabel(text: string): string {
  return latinDigits(text)
    .toLowerCase()
    .replace(/[ً-ْـ]/g, '') // harakat, tatweel
    .replace(/[أإآ]/g, 'ا')
    .replace(/ة/g, 'ه')
    .replace(/ى/g, 'ي')
    .replace(/[^\p{L}\p{N}]/gu, '');
}

/** Trimmed headers; an empty one becomes "Column N", a repeated one "Name (2)". */
export function uniqueHeaders(raw: string[]): string[] {
  const seen = new Map<string, number>();
  return raw.map((cell, i) => {
    const base = cell.trim() || `Column ${i + 1}`;
    const count = (seen.get(base) ?? 0) + 1;
    seen.set(base, count);
    return count === 1 ? base : `${base} (${count})`;
  });
}

const PHONE_WORDS = [
  'phone',
  'phonenumber',
  'mobile',
  'mobilenumber',
  'mobileno',
  'phoneno',
  'tel',
  'telephone',
  'cell',
  'cellphone',
  'whatsapp',
  'number',
  'contact',
  'contactnumber',
  'ownerphone',
  'ownermobile',
  'رقم',
  'الرقم',
  'هاتف',
  'الهاتف',
  'رقمالهاتف',
  'موبايل',
  'الموبايل',
  'رقمالموبايل',
  'تليفون',
  'التليفون',
  'رقمالتليفون',
  'جوال',
  'الجوال',
  'رقمالجوال',
  'محمول',
  'المحمول',
  'واتساب',
  'رقمالمالك',
  'تليفونالمالك',
];

/** Header words per field, English and Arabic (compared after `normalizeLabel`). */
const FIELD_WORDS: Record<ImportField, string[]> = {
  name: [
    'name',
    'fullname',
    'owner',
    'ownername',
    'client',
    'clientname',
    'customer',
    'customername',
    'contactname',
    'الاسم',
    'اسم',
    'اسمالمالك',
    'المالك',
    'مالك',
    'اسمالعميل',
    'العميل',
  ],
  phone: PHONE_WORDS,
  phone2: [
    'secondphone',
    'otherphone',
    'anotherphone',
    'altphone',
    'رقماخر',
    'رقمثاني',
    'هاتفاخر',
  ],
  phone3: ['thirdphone', 'رقمثالث'],
  area: [
    'area',
    'district',
    'location',
    'region',
    'city',
    'neighborhood',
    'neighbourhood',
    'zone',
    'المنطقه',
    'منطقه',
    'الحي',
    'حي',
    'المكان',
    'المدينه',
  ],
  note: [
    'note',
    'notes',
    'comment',
    'comments',
    'remarks',
    'ملاحظات',
    'ملاحظه',
    'تعليق',
    'تعليقات',
  ],
  purpose: [
    'purpose',
    'for',
    'saleorrent',
    'salerent',
    'offertype',
    'listingtype',
    'الغرض',
    'غرض',
    'نوعالعرض',
    'بيعاوايجار',
    'بيعايجار',
  ],
  type: [
    'type',
    'propertytype',
    'unittype',
    'category',
    'النوع',
    'نوع',
    'نوعالعقار',
    'نوعالوحده',
  ],
  compound: [
    'compound',
    'project',
    'development',
    'الكمبوند',
    'كمبوند',
    'المشروع',
    'مشروع',
  ],
  address: ['address', 'street', 'العنوان', 'عنوان'],
  sizeSqm: [
    'size',
    'sizesqm',
    'sqm',
    'areasqm',
    'aream2',
    'builtuparea',
    'bua',
    'space',
    'm2',
    'المساحه',
    'مساحه',
    'المساحهم2',
    'المساحهبالمتر',
  ],
  floor: ['floor', 'level', 'الدور', 'دور', 'الطابق', 'طابق'],
  bedrooms: [
    'bedrooms',
    'bedroom',
    'beds',
    'rooms',
    'br',
    'الغرف',
    'غرف',
    'عددالغرف',
    'غرفالنوم',
    'غرفنوم',
  ],
  bathrooms: [
    'bathrooms',
    'bathroom',
    'baths',
    'الحمامات',
    'حمامات',
    'عددالحمامات',
    'حمام',
  ],
  price: [
    'price',
    'askingprice',
    'priceegp',
    'amount',
    'السعر',
    'سعر',
    'الثمن',
    'المطلوب',
  ],
  furnishing: [
    'furnishing',
    'furnished',
    'furniture',
    'الفرش',
    'مفروش',
    'الاثاث',
    'التاثيث',
  ],
  description: [
    'description',
    'details',
    'desc',
    'الوصف',
    'وصف',
    'التفاصيل',
    'تفاصيل',
  ],
};

const WORD_FIELD: Map<string, ImportField> = new Map(
  (Object.entries(FIELD_WORDS) as [ImportField, string[]][]).flatMap(
    ([field, words]) => words.map((w) => [normalizeLabel(w), field] as const),
  ),
);
const PHONE_SET = new Set(PHONE_WORDS.map(normalizeLabel));
const PHONE_SLOTS: ImportField[] = ['phone', 'phone2', 'phone3'];

/** The field a header names, if any ("Phone 2" / "رقم 2" → phone2). */
function fieldOfHeader(header: string): ImportField | null {
  const label = normalizeLabel(header);
  const exact = WORD_FIELD.get(label);
  if (exact) return exact;
  const numbered = /^(.*?)([123])$/.exec(label);
  if (numbered && PHONE_SET.has(numbered[1])) {
    return PHONE_SLOTS[Number(numbered[2]) - 1];
  }
  return null;
}

/**
 * A suggested `{ field: header }` from the header names (English or Arabic): each field takes
 * the first header naming it. For listings, an unnumbered second phone column is ignored; for
 * owners it fills the next free phone slot.
 */
export function suggestMapping(
  kind: ImportKind,
  headers: string[],
): ImportMapping {
  const allowed = new Set(importFieldsOf(kind));
  const mapping: ImportMapping = {};
  for (const header of headers) {
    let field = fieldOfHeader(header);
    if (field === 'phone' && mapping.phone && kind === 'OWNERS') {
      field = PHONE_SLOTS.find((slot) => !mapping[slot]) ?? null;
    }
    if (field && allowed.has(field) && !mapping[field]) {
      mapping[field] = header;
    }
  }
  return mapping;
}

/** Why a mapping can't be used, or null when it can. */
export function mappingProblem(
  kind: ImportKind,
  mapping: ImportMapping,
  headers: string[],
):
  | { code: 'MAPPING_INVALID'; detail: string }
  | { code: 'MAPPING_INCOMPLETE'; missing: ImportField[] }
  | null {
  const fields = new Set<string>(importFieldsOf(kind));
  const known = new Set(headers);
  for (const [field, header] of Object.entries(mapping)) {
    if (!fields.has(field)) {
      return { code: 'MAPPING_INVALID', detail: `unknown field "${field}"` };
    }
    if (!known.has(header)) {
      return { code: 'MAPPING_INVALID', detail: `unknown column "${header}"` };
    }
  }
  const missing = IMPORT_REQUIRED_FIELDS[kind].filter((f) => !mapping[f]);
  return missing.length ? { code: 'MAPPING_INCOMPLETE', missing } : null;
}

/** `{ field: column index }` for a valid mapping. */
export function columnsOf(
  mapping: ImportMapping,
  headers: string[],
): Partial<Record<ImportField, number>> {
  const columns: Partial<Record<ImportField, number>> = {};
  for (const [field, header] of Object.entries(mapping)) {
    columns[field as ImportField] = headers.indexOf(header);
  }
  return columns;
}

/** The mapped cells of a row as `{ field: text }` (the preview sample). */
export function mappedRow(
  cells: Cells,
  columns: Partial<Record<ImportField, number>>,
): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [field, index] of Object.entries(columns)) {
    out[field] = (cells[index] ?? '').trim();
  }
  return out;
}

// ------------------------------------------------------------------ rows

export interface RowIssue {
  reason: ImportIssueReason;
  field: string | null;
  value: string | null;
}

export interface OwnerCandidate {
  name: string;
  phones: string[];
  area: string | null;
  note: string | null;
}

export interface ListingCandidate {
  ownerName: string;
  ownerPhone: string;
  purpose: ListingPurpose;
  type: PropertyType;
  area: string;
  compound: string | null;
  address: string | null;
  sizeSqm: number;
  floor: number | null;
  bedrooms: number | null;
  bathrooms: number | null;
  price: number;
  furnishing: Furnishing | null;
  description: string | null;
}

export type RowCheck<T> =
  { ok: true; value: T; phones: string[] } | { ok: false; issue: RowIssue };

const reject = (
  reason: ImportIssueReason,
  field: string,
  value: string | null,
): { ok: false; issue: RowIssue } => ({
  ok: false,
  issue: { reason, field, value },
});

function reader(cells: Cells, columns: Partial<Record<ImportField, number>>) {
  return (field: ImportField): string => {
    const index = columns[field];
    return index === undefined ? '' : (cells[index] ?? '').trim();
  };
}

/** E.164 for a cell; spreadsheets lose the national 0 of numbers stored as numbers. */
export const importedPhone = (cell: string): string | null =>
  toE164(cell, { missingTrunkZero: true });

function firstMissing(
  kind: ImportKind,
  get: (field: ImportField) => string,
): ImportField | undefined {
  return IMPORT_REQUIRED_FIELDS[kind].find((field) => get(field) === '');
}

/** An owner row: name and phone required; every given phone must be valid. */
export function checkOwnerRow(
  cells: Cells,
  columns: Partial<Record<ImportField, number>>,
): RowCheck<OwnerCandidate> {
  const get = reader(cells, columns);
  const missing = firstMissing('OWNERS', get);
  if (missing) return reject('MISSING_REQUIRED', missing, null);

  const phones: string[] = [];
  for (const slot of PHONE_SLOTS) {
    const cell = get(slot);
    if (cell === '') continue;
    const phone = importedPhone(cell);
    if (!phone) return reject('INVALID_PHONE', slot, cell);
    if (!phones.includes(phone)) phones.push(phone);
  }

  const name = get('name');
  if (name.length > OWNER_NAME_MAX_LENGTH)
    return reject('INVALID_VALUE', 'name', name);
  const area = get('area');
  if (area.length > AREA_MAX_LENGTH)
    return reject('INVALID_VALUE', 'area', area);
  const note = get('note');
  if (note.length > NOTE_BODY_MAX_LENGTH)
    return reject('INVALID_VALUE', 'note', note);

  return {
    ok: true,
    phones,
    value: { name, phones, area: area || null, note: note || null },
  };
}

const PURPOSE_WORDS: Record<string, ListingPurpose> = Object.fromEntries(
  [
    ...['sale', 'sell', 'forsale', 'buy', 'بيع', 'للبيع'].map((w) => [
      w,
      'SALE',
    ]),
    ...['rent', 'forrent', 'lease', 'rental', 'ايجار', 'للايجار', 'اجار'].map(
      (w) => [w, 'RENT'],
    ),
  ].map(([w, v]) => [normalizeLabel(w), v as ListingPurpose]),
);

const TYPE_WORDS: Record<string, PropertyType> = Object.fromEntries(
  PropertyTypeSchema.options.flatMap((type) =>
    [type, propertyTypeLabel(type, 'en'), propertyTypeLabel(type, 'ar')].map(
      (w) => [normalizeLabel(w), type],
    ),
  ),
);

const FURNISHING_WORDS: Record<string, Furnishing> = Object.fromEntries(
  [
    ...FurnishingSchema.options.map((f) => [f, f]),
    ...['notfurnished', 'no', 'غيرمفروش', 'بدونفرش'].map((w) => [
      w,
      'UNFURNISHED',
    ]),
    ...[
      'semi',
      'semifurnished',
      'partlyfurnished',
      'نصفمفروش',
      'مفروشجزئيا',
    ].map((w) => [w, 'SEMI_FURNISHED']),
    ...['yes', 'fullyfurnished', 'مفروش', 'مفروشبالكامل'].map((w) => [
      w,
      'FURNISHED',
    ]),
  ].map(([w, v]) => [normalizeLabel(w), v as Furnishing]),
);

/** A number as typed: Arabic digits, thousands separators and spaces allowed. NaN otherwise. */
export function parseNumber(cell: string): number {
  const text = latinDigits(cell)
    .replace(/[,\s٬]/g, '')
    .replace(/٫/g, '.');
  return /^-?\d+(\.\d+)?$/.test(text) ? Number(text) : Number.NaN;
}

/** Listing fields → the `POST /listings` body field they fill. */
const LISTING_DTO_FIELD: Record<string, ImportField> = {
  ownerName: 'name',
  ownerPhone: 'phone',
};

/**
 * A listing row, validated exactly like `POST /listings` (the same `CreateListingDto`) after
 * the cells are read: purpose, type and furnishing in English or Arabic, numbers with Arabic
 * digits or thousands separators.
 */
export function checkListingRow(
  cells: Cells,
  columns: Partial<Record<ImportField, number>>,
): RowCheck<ListingCandidate> {
  const get = reader(cells, columns);
  const missing = firstMissing('LISTINGS', get);
  if (missing) return reject('MISSING_REQUIRED', missing, null);

  const phoneCell = get('phone');
  const phone = importedPhone(phoneCell);
  if (!phone) return reject('INVALID_PHONE', 'phone', phoneCell);

  const body: Record<string, unknown> = {
    ownerName: get('name'),
    ownerPhone: phone,
    area: get('area'),
  };
  const enums: [ImportField, Record<string, string>][] = [
    ['purpose', PURPOSE_WORDS],
    ['type', TYPE_WORDS],
    ['furnishing', FURNISHING_WORDS],
  ];
  for (const [field, words] of enums) {
    const cell = get(field);
    if (cell === '') continue;
    const value = words[normalizeLabel(cell)];
    if (!value) return reject('INVALID_VALUE', field, cell);
    body[field] = value;
  }
  for (const field of [
    'sizeSqm',
    'floor',
    'bedrooms',
    'bathrooms',
    'price',
  ] as const) {
    const cell = get(field);
    if (cell === '') continue;
    const value = parseNumber(cell);
    if (Number.isNaN(value)) return reject('INVALID_VALUE', field, cell);
    body[field] = value;
  }
  for (const field of ['compound', 'address', 'description'] as const) {
    const cell = get(field);
    if (cell !== '') body[field] = cell;
  }

  const dto = plainToInstance(CreateListingDto, body);
  const errors = validateSync(dto, {
    whitelist: true,
    forbidNonWhitelisted: true,
  });
  if (errors.length) {
    const property = errors[0].property;
    const field = LISTING_DTO_FIELD[property] ?? (property as ImportField);
    return reject('INVALID_VALUE', field, get(field) || null);
  }
  return {
    ok: true,
    phones: [phone],
    value: {
      ownerName: dto.ownerName as string,
      ownerPhone: phone,
      purpose: dto.purpose,
      type: dto.type,
      area: dto.area,
      compound: dto.compound ?? null,
      address: dto.address ?? null,
      sizeSqm: dto.sizeSqm,
      floor: dto.floor ?? null,
      bedrooms: dto.bedrooms ?? null,
      bathrooms: dto.bathrooms ?? null,
      price: dto.price,
      furnishing: dto.furnishing ?? null,
      description: dto.description ?? null,
    },
  };
}

// ------------------------------------------------------------------ duplicates

/** Who holds a phone in the database. */
export interface OwnerPhoneHit {
  ownerId: string;
  deleted: boolean;
  assignedToId: string | null;
  /** The owner's live listing, if any. */
  listingId: string | null;
}

export interface PhoneLookup {
  owners: Map<string, OwnerPhoneHit>;
  /** Live listings by owner phone. */
  listings: Map<string, string>;
}

export interface ClassifiedIssue extends RowIssue {
  ownerId: string | null;
  listingId: string | null;
  /** The owner holding the phone is in the trash. */
  inTrash: boolean;
}

export interface Classified<T> {
  rowNumber: number;
  /** Set when the row is not added. */
  issue: ClassifiedIssue | null;
  value: T | null;
  /** Listings: the live owner lead the new listing links to. */
  link: OwnerPhoneHit | null;
}

export interface StagedRow {
  rowNumber: number;
  cells: Cells;
}

export interface CheckedRow<T> {
  rowNumber: number;
  result: RowCheck<T>;
}

/** Reads and validates every row (no duplicate check yet). */
export function checkRows(
  kind: ImportKind,
  rows: StagedRow[],
  columns: Partial<Record<ImportField, number>>,
): CheckedRow<OwnerCandidate | ListingCandidate>[] {
  const check = kind === 'OWNERS' ? checkOwnerRow : checkListingRow;
  return rows.map(({ rowNumber, cells }) => ({
    rowNumber,
    result: check(cells, columns),
  }));
}

/** Every phone of the valid rows, once (for the database lookup). */
export function phonesOf(checked: CheckedRow<unknown>[]): string[] {
  const phones = new Set<string>();
  for (const { result } of checked) {
    if (result.ok) result.phones.forEach((p) => phones.add(p));
  }
  return [...phones];
}

/**
 * Marks duplicates among the valid rows: a phone held by an owner (any slot, trashed
 * included) or a live listing, or by an earlier row of this file that will be added. A
 * listing row whose phone is an owner lead's links to it, unless that owner already has a
 * live listing (then it's a DUPLICATE of that listing) or an earlier row already links it.
 */
export function classifyRows<T>(
  kind: ImportKind,
  checked: CheckedRow<T>[],
  lookup: PhoneLookup,
): Classified<T>[] {
  const claimed = new Set<string>();
  const linkedOwners = new Set<string>();

  return checked.map(({ rowNumber, result }): Classified<T> => {
    if (!result.ok) {
      return {
        rowNumber,
        issue: {
          ...result.issue,
          ownerId: null,
          listingId: null,
          inTrash: false,
        },
        value: null,
        link: null,
      };
    }
    const duplicate = (
      phone: string,
      ownerId: string | null,
      listingId: string | null,
      inTrash = false,
    ): Classified<T> => ({
      rowNumber,
      issue: {
        reason: 'DUPLICATE',
        field: 'phone',
        value: phone,
        ownerId,
        listingId,
        inTrash,
      },
      value: null,
      link: null,
    });

    let link: OwnerPhoneHit | null = null;
    for (const phone of result.phones) {
      const listingId = lookup.listings.get(phone);
      if (listingId) return duplicate(phone, null, listingId);
      const owner = lookup.owners.get(phone);
      if (owner) {
        if (kind === 'OWNERS' || owner.deleted || owner.listingId) {
          return duplicate(
            phone,
            owner.ownerId,
            owner.listingId,
            owner.deleted,
          );
        }
        if (linkedOwners.has(owner.ownerId))
          return duplicate(phone, null, null);
        link = owner;
      }
      if (claimed.has(phone)) return duplicate(phone, null, null);
    }
    result.phones.forEach((p) => claimed.add(p));
    if (link) linkedOwners.add(link.ownerId);
    return { rowNumber, issue: null, value: result.value, link };
  });
}

/** `added + duplicates + rejected = total`. */
export function countsOf(
  rows: { issue: { reason: string } | null }[],
): ImportCounts {
  const duplicates = rows.filter((r) => r.issue?.reason === 'DUPLICATE').length;
  const rejected = rows.filter(
    (r) => r.issue && r.issue.reason !== 'DUPLICATE',
  ).length;
  return {
    total: rows.length,
    added: rows.length - duplicates - rejected,
    duplicates,
    rejected,
  };
}
