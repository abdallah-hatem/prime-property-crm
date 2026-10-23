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

/**
 * A phone as people read it: `+201055500010` → `0105 550 0010`, `+20223456789` → `02 2345 6789`.
 * Anything else is shown as stored. Always render it `dir="ltr"`.
 */
export function formatPhone(e164: string): string {
  const local = e164.startsWith('+20') ? `0${e164.slice(3)}` : null;
  if (!local) return e164;
  if (/^01\d{9}$/.test(local))
    return `${local.slice(0, 4)} ${local.slice(4, 7)} ${local.slice(7)}`;
  if (/^02\d{8}$/.test(local))
    return `${local.slice(0, 2)} ${local.slice(2, 6)} ${local.slice(6)}`;
  return local;
}

export type Lateness =
  | { unit: 'minutes'; value: number }
  | { unit: 'hours'; value: number }
  | { unit: 'days'; value: number };

/** How late something due at `due` is at `now` (at least one minute). */
export function lateness(due: Date | string, now: Date): Lateness {
  const minutes = Math.max(
    1,
    Math.floor((now.getTime() - new Date(due).getTime()) / 60000),
  );
  if (minutes < 60) return { unit: 'minutes', value: minutes };
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return { unit: 'hours', value: hours };
  return { unit: 'days', value: Math.floor(hours / 24) };
}
