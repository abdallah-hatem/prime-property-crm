import { ANALYTICS_MAX_DAYS } from '@prime-crm/shared';
import { addDays, type CairoDay } from '@/lib/cairo-time';

/**
 * Analytics date ranges: whole Cairo days, both ends included, at most ANALYTICS_MAX_DAYS. The
 * URL holds a preset name (`range=last7`, relative to today) or a custom `from` / `to`; the page
 * resolves either into the two Cairo dates the API takes.
 */

export const RANGE_PRESETS = [
  'today',
  'yesterday',
  'thisWeek',
  'last7',
  'thisMonth',
  'last30',
] as const;
export type RangePreset = (typeof RANGE_PRESETS)[number];

export interface DayRange {
  from: CairoDay;
  to: CairoDay;
}

/** The range as the screen shows it: which preset (or custom) and its two dates. */
export interface ResolvedRange extends DayRange {
  preset: RangePreset | 'custom';
}

const DAY_RE = /^\d{4}-\d{2}-\d{2}$/;

const isDay = (value: string | undefined): value is CairoDay => {
  if (!value || !DAY_RE.test(value)) return false;
  const [y, m, d] = value.split('-').map(Number) as [number, number, number];
  const date = new Date(Date.UTC(y, m - 1, d));
  return (
    date.getUTCFullYear() === y &&
    date.getUTCMonth() === m - 1 &&
    date.getUTCDate() === d
  );
};

/** Day of the week of a Cairo date, 0 = Sunday … 6 = Saturday. */
const weekday = (day: CairoDay): number => {
  const [y, m, d] = day.split('-').map(Number) as [number, number, number];
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay();
};

/** The Egyptian week starts on Saturday. */
export const WEEK_START = 6;

/** Days from `from` to `to`, both included (1 for a single day). */
export function rangeLength({ from, to }: DayRange): number {
  const ms = (day: CairoDay) => {
    const [y, m, d] = day.split('-').map(Number) as [number, number, number];
    return Date.UTC(y, m - 1, d);
  };
  return Math.round((ms(to) - ms(from)) / 86_400_000) + 1;
}

/** The two Cairo dates of a preset, for `today` (a Cairo date). */
export function presetRange(preset: RangePreset, today: CairoDay): DayRange {
  switch (preset) {
    case 'today':
      return { from: today, to: today };
    case 'yesterday': {
      const day = addDays(today, -1);
      return { from: day, to: day };
    }
    case 'thisWeek':
      return {
        from: addDays(today, -((weekday(today) - WEEK_START + 7) % 7)),
        to: today,
      };
    case 'last7':
      return { from: addDays(today, -6), to: today };
    case 'thisMonth':
      return { from: `${today.slice(0, 8)}01`, to: today };
    case 'last30':
      return { from: addDays(today, -29), to: today };
  }
}

const isPreset = (value: string | undefined): value is RangePreset =>
  (RANGE_PRESETS as readonly string[]).includes(value ?? '');

/**
 * What the URL asks for. A preset wins; otherwise `from` / `to` (one date alone is that day,
 * reversed dates are swapped, a range longer than the limit keeps its end and is cut to the
 * limit). Nothing usable → today.
 */
export function resolveRange(
  params: { range?: string; from?: string; to?: string },
  today: CairoDay,
): ResolvedRange {
  if (isPreset(params.range))
    return { preset: params.range, ...presetRange(params.range, today) };

  let from = isDay(params.from) ? params.from : undefined;
  let to = isDay(params.to) ? params.to : undefined;
  if (!from && !to) return { preset: 'today', from: today, to: today };
  from ??= to as CairoDay;
  to ??= from;
  if (from > to) [from, to] = [to, from];
  if (rangeLength({ from, to }) > ANALYTICS_MAX_DAYS)
    from = addDays(to, -(ANALYTICS_MAX_DAYS - 1));
  return { preset: 'custom', from, to };
}

/** URL params for a preset or a custom range (the other keys cleared). */
export function rangeParams(
  range: { preset: RangePreset } | DayRange,
): Record<'range' | 'from' | 'to', string | null> {
  return 'preset' in range
    ? { range: range.preset, from: null, to: null }
    : { range: null, from: range.from, to: range.to };
}

/** The query string that keeps a range when moving between analytics pages. */
export function rangeQuery(range: ResolvedRange): string {
  const params = new URLSearchParams();
  if (range.preset === 'custom') {
    params.set('from', range.from);
    params.set('to', range.to);
  } else if (range.preset !== 'today') {
    params.set('range', range.preset);
  }
  const qs = params.toString();
  return qs ? `?${qs}` : '';
}
