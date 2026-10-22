import {
  ANALYTICS_MAX_DAYS,
  type Language,
  type Stats,
} from '@prime-crm/shared';
import {
  cairoDateOf,
  cairoDateRange,
  cairoDaysInRange,
  isCalendarDate,
} from '../../common/utils/cairo-date.util';
import type {
  AnalyticsWindow,
  MemberCount,
  OutcomeLabelRow,
  StatsSources,
} from './interfaces/analytics.interface';

export type RangeRefusal = 'NOT_A_DATE' | 'FROM_AFTER_TO' | 'TOO_LONG';

/**
 * The analytics range: Cairo dates, both included. Unset = today (Cairo); one end only = that
 * single day. At most ANALYTICS_MAX_DAYS days.
 */
export function resolveWindow(
  query: { from?: string; to?: string },
  now: Date,
): AnalyticsWindow | RangeRefusal {
  const today = cairoDateOf(now);
  const from = query.from ?? query.to ?? today;
  const to = query.to ?? query.from ?? today;
  if (!isCalendarDate(from) || !isCalendarDate(to)) return 'NOT_A_DATE';
  if (from > to) return 'FROM_AFTER_TO';
  if (cairoDaysInRange(from, to) > ANALYTICS_MAX_DAYS) return 'TOO_LONG';
  const { start, end } = cairoDateRange(from, to);
  return { from, to, start, end, asOf: end < now ? end : now };
}

export function emptyStats(): Stats {
  return {
    calls: 0,
    outcomes: [],
    remindersDone: 0,
    remindersOverdue: 0,
    assignedOwners: 0,
    interestedOwners: 0,
    listingsCreated: 0,
    adsLive: 0,
    adsTakenDown: 0,
  };
}

const COUNT_KEYS = [
  'calls',
  'remindersDone',
  'remindersOverdue',
  'assignedOwners',
  'interestedOwners',
  'listingsCreated',
  'adsLive',
  'adsTakenDown',
] as const satisfies readonly (keyof Stats & keyof StatsSources)[];

const countOf = (rows: MemberCount[], memberId: string): number =>
  rows.find((r) => r.memberId === memberId)?.count ?? 0;

/** Orders an outcomes breakdown like the outcome list (order, then label). */
function sortOutcomes(
  outcomes: Stats['outcomes'],
  labels: Map<string, OutcomeLabelRow>,
): Stats['outcomes'] {
  return [...outcomes].sort(
    (a, b) =>
      (labels.get(a.outcomeId)?.order ?? 0) -
        (labels.get(b.outcomeId)?.order ?? 0) || a.label.localeCompare(b.label),
  );
}

/** One member's Stats from the per-member query results; outcome labels in `language`. */
export function statsFor(
  memberId: string,
  sources: StatsSources,
  labels: Map<string, OutcomeLabelRow>,
  language: Language,
): Stats {
  const stats = emptyStats();
  for (const key of COUNT_KEYS) stats[key] = countOf(sources[key], memberId);
  stats.outcomes = sortOutcomes(
    sources.outcomes
      .filter((r) => r.memberId === memberId)
      .map((r) => {
        const label = labels.get(r.outcomeId);
        return {
          outcomeId: r.outcomeId,
          label: label
            ? language === 'ar'
              ? label.labelAr
              : label.labelEn
            : '',
          count: r.count,
        };
      }),
    labels,
  );
  return stats;
}

/** Team totals: the sum of the members (outcomes merged by id). */
export function sumStats(
  members: Stats[],
  labels: Map<string, OutcomeLabelRow>,
): Stats {
  const total = emptyStats();
  const outcomes = new Map<string, Stats['outcomes'][number]>();
  for (const m of members) {
    for (const key of COUNT_KEYS) total[key] += m[key];
    for (const o of m.outcomes) {
      const seen = outcomes.get(o.outcomeId);
      if (seen) seen.count += o.count;
      else outcomes.set(o.outcomeId, { ...o });
    }
  }
  total.outcomes = sortOutcomes([...outcomes.values()], labels);
  return total;
}

/** Every member id with a non-zero count in the range (deactivated members who worked). */
export function membersWithActivity(sources: StatsSources): string[] {
  return [
    ...new Set(
      (Object.values(sources) as MemberCount[][]).flatMap((rows) =>
        rows.map((r) => r.memberId),
      ),
    ),
  ];
}

/** Every Cairo day of the window, oldest first, with its calls (0 where none). */
export function fillDays(
  window: Pick<AnalyticsWindow, 'from' | 'to'>,
  counts: { date: string; count: number }[],
): { date: string; calls: number }[] {
  const byDate = new Map(counts.map((c) => [c.date, c.count]));
  const days: { date: string; calls: number }[] = [];
  const [y, m, d] = window.from.split('-').map(Number);
  const total = cairoDaysInRange(window.from, window.to);
  for (let i = 0; i < total; i++) {
    const date = new Date(Date.UTC(y, m - 1, d + i)).toISOString().slice(0, 10);
    days.push({ date, calls: byDate.get(date) ?? 0 });
  }
  return days;
}
