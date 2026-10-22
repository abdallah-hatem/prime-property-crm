import type { Language } from './enums';

/**
 * Excel exports (`GET /exports/owners`, `GET /exports/listings`, `data.export`). They take the
 * list endpoints' filters (without paging) and answer an `.xlsx` file, not the envelope.
 * Headers are in the caller's language; phone columns are text, so `+20…` keeps its `+`.
 */
export const EXPORT_MAX_ROWS = 50_000;

export const EXPORT_CONTENT_TYPE =
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

/** Domain error codes of the export endpoints. */
export const ExportErrorCode = {
  /** More than EXPORT_MAX_ROWS rows match: narrow the filters. */
  EXPORT_TOO_LARGE: 'EXPORT_TOO_LARGE',
} as const;
export type ExportErrorCode =
  (typeof ExportErrorCode)[keyof typeof ExportErrorCode];

export type ExportKind = 'owners' | 'listings';

type Header = Record<Language, string>;

/** Owners sheet columns, in order. */
export const OWNER_EXPORT_HEADERS = {
  name: { en: 'Name', ar: 'الاسم' },
  phone1: { en: 'Phone 1', ar: 'الهاتف 1' },
  phone2: { en: 'Phone 2', ar: 'الهاتف 2' },
  phone3: { en: 'Phone 3', ar: 'الهاتف 3' },
  area: { en: 'Area', ar: 'المنطقة' },
  status: { en: 'Status', ar: 'الحالة' },
  assignedTo: { en: 'Assigned to', ar: 'المسؤول' },
  lastCallAt: { en: 'Last call', ar: 'آخر مكالمة' },
  lastOutcome: { en: 'Last outcome', ar: 'آخر نتيجة' },
  nextReminderAt: { en: 'Next reminder', ar: 'التذكير القادم' },
  createdAt: { en: 'Added', ar: 'تاريخ الإضافة' },
} as const satisfies Record<string, Header>;

/** Listings sheet columns, in order. The owner columns are empty where the phone is hidden. */
export const LISTING_EXPORT_HEADERS = {
  title: { en: 'Title', ar: 'العنوان' },
  purpose: { en: 'Purpose', ar: 'الغرض' },
  type: { en: 'Type', ar: 'النوع' },
  area: { en: 'Area', ar: 'المنطقة' },
  compound: { en: 'Compound', ar: 'الكمبوند' },
  address: { en: 'Address', ar: 'العنوان التفصيلي' },
  price: { en: 'Price (EGP)', ar: 'السعر (جنيه)' },
  sizeSqm: { en: 'Size (m²)', ar: 'المساحة (م²)' },
  bedrooms: { en: 'Bedrooms', ar: 'غرف النوم' },
  bathrooms: { en: 'Bathrooms', ar: 'الحمامات' },
  floor: { en: 'Floor', ar: 'الطابق' },
  furnishing: { en: 'Furnishing', ar: 'التأثيث' },
  status: { en: 'Status', ar: 'الحالة' },
  adStatus: { en: 'Ad', ar: 'الإعلان' },
  adLink: { en: 'Ad link', ar: 'رابط الإعلان' },
  ownerName: { en: 'Owner', ar: 'المالك' },
  ownerPhone: { en: 'Owner phone', ar: 'هاتف المالك' },
  assignedTo: { en: 'Assigned to', ar: 'المسؤول' },
  createdAt: { en: 'Added', ar: 'تاريخ الإضافة' },
} as const satisfies Record<string, Header>;

export const LISTING_PURPOSE_LABELS = {
  SALE: { en: 'Sale', ar: 'بيع' },
  RENT: { en: 'Rent', ar: 'إيجار' },
} as const satisfies Record<string, Header>;

export const FURNISHING_LABELS = {
  UNFURNISHED: { en: 'Unfurnished', ar: 'غير مفروشة' },
  SEMI_FURNISHED: { en: 'Semi-furnished', ar: 'نصف مفروشة' },
  FURNISHED: { en: 'Furnished', ar: 'مفروشة' },
} as const satisfies Record<string, Header>;

/** `owners-2026-10-23.xlsx`: the export's file name for a Cairo date. */
export function exportFileName(kind: ExportKind, cairoDate: string): string {
  return `${kind}-${cairoDate}.xlsx`;
}
