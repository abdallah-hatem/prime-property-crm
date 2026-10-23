'use client';

import { useState } from 'react';
import type { MemberAnalytics } from '@prime-crm/shared';
import { Skeleton } from '@/components/ui/skeleton';
import { useTranslation } from '@/i18n/i18n-provider';
import { formatNumber } from '@/lib/format';
import { cn } from '@/lib/utils';
import { ChartCard } from './chart-card';
import { shortDay } from './format-day';
import { WEEK_START } from './range';

/** Up to this many days the chart has one column per day; longer ranges go by week. */
export const DAILY_MAX_DAYS = 62;

export interface CallBucket {
  /** First day of the bucket (the day itself, or the week's first day in the range). */
  date: string;
  calls: number;
}

/** Days as they are, or summed into weeks that start on Saturday (the first may be partial). */
export function bucketCalls(byDay: MemberAnalytics['byDay']): {
  unit: 'day' | 'week';
  buckets: CallBucket[];
} {
  if (byDay.length <= DAILY_MAX_DAYS)
    return { unit: 'day', buckets: byDay.map((d) => ({ ...d })) };
  const buckets: CallBucket[] = [];
  for (const day of byDay) {
    const [y, m, d] = day.date.split('-').map(Number) as [
      number,
      number,
      number,
    ];
    const weekday = new Date(Date.UTC(y, m - 1, d)).getUTCDay();
    const last = buckets.at(-1);
    if (!last || weekday === WEEK_START) buckets.push({ ...day });
    else last.calls += day.calls;
  }
  return { unit: 'week', buckets };
}

/** A clean top for the y-axis: 1, 2, 5 × 10ⁿ at or above `max` (at least 4). */
export function niceMax(max: number): number {
  if (max <= 4) return 4;
  const power = 10 ** Math.floor(Math.log10(max));
  const step = [1, 2, 2.5, 5, 10].find((s) => s * power >= max) ?? 10;
  return step * power;
}

const PLOT_HEIGHT = 'h-40';

/**
 * Calls by day: one column per day (per week past two months) from the start edge, so time reads
 * right-to-left in Arabic like the text around it. Hover, tap or the arrow keys show a column's
 * date and count; the same numbers sit in a table for screen readers.
 */
export function CallsByDayChart({
  byDay,
}: {
  byDay: MemberAnalytics['byDay'];
}) {
  const { t, locale, dir } = useTranslation();
  const { unit, buckets } = bucketCalls(byDay);
  const top = niceMax(Math.max(0, ...buckets.map((b) => b.calls)));
  const [active, setActive] = useState<number | null>(null);
  const n = buckets.length;
  const gap = n <= DAILY_MAX_DAYS / 2 ? 'gap-0.5' : 'gap-px';

  const label = (b: CallBucket) =>
    unit === 'week'
      ? t('analytics.byDay.weekOf', { date: shortDay(b.date, locale) })
      : shortDay(b.date, locale);
  const callsText = (count: number) =>
    count === 1
      ? t('analytics.byDay.oneCall')
      : t('analytics.byDay.calls', { count: formatNumber(count) });

  const move = (key: string) => {
    const forward = dir === 'rtl' ? 'ArrowLeft' : 'ArrowRight';
    const back = dir === 'rtl' ? 'ArrowRight' : 'ArrowLeft';
    const current = active ?? -1;
    if (key === forward) setActive(Math.min(n - 1, current + 1));
    else if (key === back) setActive(Math.max(0, current - 1));
    else if (key === 'Home') setActive(0);
    else if (key === 'End') setActive(n - 1);
    else return false;
    return true;
  };

  const shown = active === null ? null : buckets[active];
  // Keep the tooltip inside the plot near its edges.
  const at =
    active === null
      ? 0
      : Math.min(88, Math.max(12, ((active + 0.5) / n) * 100));

  return (
    <ChartCard
      title={
        unit === 'week'
          ? t('analytics.byDay.titleWeeks')
          : t('analytics.byDay.title')
      }
      subtitle={
        unit === 'week'
          ? t('analytics.byDay.subtitleWeeks')
          : t('analytics.byDay.subtitle')
      }
      testId="calls-by-day"
    >
      <div className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-2">
        {/* y-axis: three clean ticks, on the start side */}
        <div
          aria-hidden
          className={cn(
            'flex flex-col justify-between text-end font-numeric text-[11px] leading-none text-muted-foreground tabular-nums',
            PLOT_HEIGHT,
          )}
        >
          <span className="-translate-y-1/2">{formatNumber(top)}</span>
          <span>{formatNumber(top / 2)}</span>
          <span className="translate-y-1/2">0</span>
        </div>

        <div className="relative min-w-0">
          {/* hairline grid: top, middle, baseline */}
          <div
            aria-hidden
            className={cn(
              'pointer-events-none absolute inset-x-0 top-0 flex flex-col justify-between',
              PLOT_HEIGHT,
            )}
          >
            <span className="h-px bg-border" />
            <span className="h-px bg-border" />
            <span className="h-px bg-border" />
          </div>

          <div
            role="group"
            tabIndex={0}
            aria-label={
              shown
                ? `${label(shown)}: ${callsText(shown.calls)}`
                : t('analytics.byDay.tableCaption')
            }
            data-testid="calls-plot"
            onKeyDown={(event) => {
              if (move(event.key)) event.preventDefault();
            }}
            onBlur={() => setActive(null)}
            onPointerLeave={() => setActive(null)}
            className={cn(
              'relative flex items-end rounded-sm outline-none focus-visible:ring-4 focus-visible:ring-ring/20',
              gap,
              PLOT_HEIGHT,
            )}
          >
            {buckets.map((b, i) => (
              <div
                key={b.date}
                onPointerEnter={() => setActive(i)}
                onPointerDown={() => setActive(i)}
                className="flex h-full min-w-0 flex-1 cursor-default items-end justify-center"
              >
                <div
                  className={cn(
                    'w-full max-w-6 rounded-t-[4px] bg-chart-1 transition-opacity duration-150',
                    active !== null && active !== i && 'opacity-55',
                  )}
                  style={{
                    height:
                      b.calls > 0 ? `max(2px, ${(b.calls / top) * 100}%)` : 0,
                  }}
                />
              </div>
            ))}

            {shown && (
              <div
                role="status"
                className="pointer-events-none absolute -top-2 z-10 -translate-x-1/2 -translate-y-full rounded-sm bg-popover px-3 py-2 text-xs whitespace-nowrap text-popover-foreground shadow-float rtl:translate-x-1/2"
                style={{ insetInlineStart: `${at}%` }}
              >
                <span className="block font-numeric text-sm font-bold tabular-nums">
                  {callsText(shown.calls)}
                </span>
                <span className="text-muted-foreground">{label(shown)}</span>
              </div>
            )}
          </div>

          {/* x-axis: first and last day */}
          <div
            aria-hidden
            className="mt-2 flex justify-between gap-2 text-[11px] text-muted-foreground"
          >
            <span>{shortDay(buckets[0]?.date ?? '', locale)}</span>
            {n > 1 && <span>{shortDay(buckets[n - 1]!.date, locale)}</span>}
          </div>
        </div>
      </div>

      <table className="sr-only">
        <caption>{t('analytics.byDay.tableCaption')}</caption>
        <thead>
          <tr>
            <th scope="col">{t('analytics.byDay.day')}</th>
            <th scope="col">{t('analytics.stats.calls')}</th>
          </tr>
        </thead>
        <tbody>
          {buckets.map((b) => (
            <tr key={b.date}>
              <td>{label(b)}</td>
              <td>{b.calls}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </ChartCard>
  );
}

/** Same box as CallsByDayChart. */
export function CallsByDayChartSkeleton() {
  return (
    <ChartCard.Skeleton>
      <div className={cn('flex items-end gap-1.5', PLOT_HEIGHT)}>
        {[40, 65, 30, 80, 55, 20, 70, 45, 60, 35].map((h, i) => (
          <Skeleton
            key={i}
            className="flex-1 rounded-b-none"
            style={{ height: `${h}%` }}
          />
        ))}
      </div>
    </ChartCard.Skeleton>
  );
}
