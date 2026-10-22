import type { Locale } from '@prime-crm/shared';

/** All business dates are Cairo dates (spec: "today" is computed in Africa/Cairo). */
export const BUSINESS_TIME_ZONE = 'Africa/Cairo';

/** Grouping only, Latin digits in both languages (numerals stay in Plus Jakarta Sans). */
const grouped = new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 });

/** `1500000` → `1,500,000`. Whole EGP: prices are integers. */
export const formatNumber = (value: number): string => grouped.format(value);

export type DateStyle = 'date' | 'dateTime' | 'time' | 'weekday';

const DATE_OPTIONS: Record<DateStyle, Intl.DateTimeFormatOptions> = {
  date: { day: 'numeric', month: 'short', year: 'numeric' },
  dateTime: {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  },
  time: { hour: 'numeric', minute: '2-digit' },
  weekday: { weekday: 'long', day: 'numeric', month: 'long' },
};

/** Month names in the reader's language, Latin digits, always on Cairo time. */
const intlLocale = (locale: Locale): string =>
  locale === 'ar' ? 'ar-EG-u-nu-latn' : 'en-GB';

export function formatDate(
  value: Date | string,
  locale: Locale,
  style: DateStyle = 'date',
): string {
  const date = typeof value === 'string' ? new Date(value) : value;
  if (Number.isNaN(date.getTime())) return '';
  return new Intl.DateTimeFormat(intlLocale(locale), {
    ...DATE_OPTIONS[style],
    timeZone: BUSINESS_TIME_ZONE,
  }).format(date);
}
