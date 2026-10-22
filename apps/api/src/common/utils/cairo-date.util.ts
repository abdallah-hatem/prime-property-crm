/**
 * "Today" and date ranges in Africa/Cairo (spec, Conventions: Times). Egypt observes DST
 * (last Friday of April to last Thursday of October), so offsets come from the tz database via
 * Intl, never from a fixed +02:00. Ranges are half-open: [start, end).
 */
export const CAIRO_TIME_ZONE = 'Africa/Cairo';

const DATE_ONLY = /^(\d{4})-(\d{2})-(\d{2})$/;
const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;

const cairoDateFormat = new Intl.DateTimeFormat('en-CA', {
  timeZone: CAIRO_TIME_ZONE,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});

export interface DateRange {
  /** First instant of the range. */
  start: Date;
  /** First instant after the range. */
  end: Date;
}

/** The Cairo calendar date of an instant, as `YYYY-MM-DD`. */
export function cairoDateOf(instant: Date): string {
  return cairoDateFormat.format(instant);
}

function parts(day: string): [number, number, number] | null {
  const match = DATE_ONLY.exec(day);
  if (!match) return null;
  return [Number(match[1]), Number(match[2]), Number(match[3])];
}

/** True for a real calendar date written `YYYY-MM-DD` (rejects 2026-02-30). */
export function isCalendarDate(value: string): boolean {
  const p = parts(value);
  if (!p) return false;
  const [y, m, d] = p;
  const utc = new Date(Date.UTC(y, m - 1, d));
  return (
    utc.getUTCFullYear() === y &&
    utc.getUTCMonth() === m - 1 &&
    utc.getUTCDate() === d
  );
}

function calendarParts(day: string): [number, number, number] {
  const p = parts(day);
  if (!p || !isCalendarDate(day)) {
    throw new RangeError(`Not a calendar date (YYYY-MM-DD): ${day}`);
  }
  return p;
}

/** The day after `day`, both `YYYY-MM-DD`. */
function nextDay(day: string): string {
  const [y, m, d] = calendarParts(day);
  return new Date(Date.UTC(y, m - 1, d + 1)).toISOString().slice(0, 10);
}

/**
 * The first instant of Cairo day `day`. Cairo is UTC+2 or UTC+3, so local midnight falls at
 * 21:00 or 22:00 UTC the evening before; the earlier candidate already on `day` wins. On the
 * spring-forward day (00:00 jumps to 01:00) that is 01:00 local.
 */
export function startOfCairoDay(day: string): Date {
  const [y, m, d] = calendarParts(day);
  const utcMidnight = Date.UTC(y, m - 1, d);
  for (const offsetHours of [3, 2]) {
    const candidate = new Date(utcMidnight - offsetHours * HOUR_MS);
    if (cairoDateOf(candidate) === day) return candidate;
  }
  // Unreachable while Cairo stays within UTC+2..+3; fail loudly if the tz rules ever change.
  throw new RangeError(`Cannot resolve the start of Cairo day ${day}`);
}

/** Cairo day `day` as a half-open range: [its first instant, the next day's first instant). */
export function cairoDayRange(day: string): DateRange {
  return { start: startOfCairoDay(day), end: startOfCairoDay(nextDay(day)) };
}

/** "Today" in Cairo at `now`. */
export function cairoToday(now: Date): DateRange {
  return cairoDayRange(cairoDateOf(now));
}

/** Cairo days `from` through `to`, both included: [start of `from`, start of the day after `to`). */
export function cairoDateRange(from: string, to: string): DateRange {
  const start = startOfCairoDay(from);
  const end = startOfCairoDay(nextDay(to));
  if (start >= end) {
    throw new RangeError(`Range ends before it starts: ${from} to ${to}`);
  }
  return { start, end };
}

/** Number of Cairo calendar days in `from`..`to`, both included (for range-length limits). */
export function cairoDaysInRange(from: string, to: string): number {
  const [fy, fm, fd] = calendarParts(from);
  const [ty, tm, td] = calendarParts(to);
  return (
    Math.round((Date.UTC(ty, tm - 1, td) - Date.UTC(fy, fm - 1, fd)) / DAY_MS) +
    1
  );
}

/**
 * A filter bound given as a Cairo date (`YYYY-MM-DD`) or a full ISO instant. A date as `from`
 * means the start of that Cairo day; as `to`, the end of it (exclusive: the next day's start).
 * An instant is used as given.
 */
export function rangeBound(value: string, side: 'from' | 'to'): Date {
  if (DATE_ONLY.test(value)) {
    return side === 'from'
      ? startOfCairoDay(value)
      : startOfCairoDay(nextDay(value));
  }
  const instant = new Date(value);
  if (Number.isNaN(instant.getTime())) {
    throw new RangeError(`Not a date or ISO instant: ${value}`);
  }
  return instant;
}

/**
 * Optional `from`/`to` filter bounds resolved with `rangeBound`. `valid` is false when both are
 * given and `from` is not before `to` (the service answers 400).
 */
export function filterBounds(
  from?: string,
  to?: string,
): { from?: Date; to?: Date; valid: boolean } {
  const start = from ? rangeBound(from, 'from') : undefined;
  const end = to ? rangeBound(to, 'to') : undefined;
  return { from: start, to: end, valid: !(start && end && start >= end) };
}
