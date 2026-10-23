import { BUSINESS_TIME_ZONE } from './format';

/**
 * Wall-clock time in Cairo. Reminders are picked as a Cairo date and time and sent to the API as
 * an instant with its offset, whatever zone the phone is set to. Egypt has summer time, so the
 * offset is read for the day in question, never assumed.
 */

/** A Cairo calendar day, `YYYY-MM-DD`. */
export type CairoDay = string;
/** A Cairo time of day, `HH:mm` (24 h). */
export type CairoTime = string;

const PARTS = new Intl.DateTimeFormat('en-US', {
  timeZone: BUSINESS_TIME_ZONE,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
  hourCycle: 'h23',
});

interface WallClock {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
}

function wallClock(date: Date): WallClock {
  const get = (type: Intl.DateTimeFormatPartTypes) =>
    Number(PARTS.formatToParts(date).find((p) => p.type === type)?.value);
  return {
    year: get('year'),
    month: get('month'),
    day: get('day'),
    hour: get('hour'),
    minute: get('minute'),
    second: get('second'),
  };
}

const pad = (n: number) => String(n).padStart(2, '0');

/** Cairo's offset from UTC at `date`, in minutes (+180 in summer, +120 in winter). */
export function cairoOffsetMinutes(date: Date): number {
  const w = wallClock(date);
  const asUtc = Date.UTC(
    w.year,
    w.month - 1,
    w.day,
    w.hour,
    w.minute,
    w.second,
  );
  return Math.round((asUtc - Math.floor(date.getTime() / 1000) * 1000) / 60000);
}

/** The Cairo day and time of an instant. */
export function toCairo(date: Date): { day: CairoDay; time: CairoTime } {
  const w = wallClock(date);
  return {
    day: `${w.year}-${pad(w.month)}-${pad(w.day)}`,
    time: `${pad(w.hour)}:${pad(w.minute)}`,
  };
}

/** The instant of a Cairo day and time. */
export function fromCairo(day: CairoDay, time: CairoTime): Date {
  const [y, m, d] = day.split('-').map(Number) as [number, number, number];
  const [hh, mm] = time.split(':').map(Number) as [number, number];
  const guess = Date.UTC(y, m - 1, d, hh, mm);
  // Two passes settle the offset across a summer-time change.
  let instant = guess - cairoOffsetMinutes(new Date(guess)) * 60000;
  instant = guess - cairoOffsetMinutes(new Date(instant)) * 60000;
  return new Date(instant);
}

/** `2026-10-23T10:00:00+03:00`: what the API takes for a reminder's `dueAt`. */
export function cairoInstant(day: CairoDay, time: CairoTime): string {
  const date = fromCairo(day, time);
  const offset = cairoOffsetMinutes(date);
  const sign = offset >= 0 ? '+' : '-';
  const abs = Math.abs(offset);
  return `${day}T${time}:00${sign}${pad(Math.floor(abs / 60))}:${pad(abs % 60)}`;
}

/** `day` plus `n` calendar days. */
export function addDays(day: CairoDay, n: number): CairoDay {
  const [y, m, d] = day.split('-').map(Number) as [number, number, number];
  const next = new Date(Date.UTC(y, m - 1, d + n));
  return `${next.getUTCFullYear()}-${pad(next.getUTCMonth() + 1)}-${pad(next.getUTCDate())}`;
}

/** Whether two instants fall on the same Cairo day. */
export const sameCairoDay = (a: Date, b: Date): boolean =>
  toCairo(a).day === toCairo(b).day;
