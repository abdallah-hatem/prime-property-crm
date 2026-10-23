'use client';

import { CalendarSearch } from 'lucide-react';
import type { MemberStats, TeamAnalytics } from '@prime-crm/shared';
import { EmptyState } from '@/components/empty-state';
import { PageHeader } from '@/components/page-header';
import { Button } from '@/components/ui/button';
import { useTranslation } from '@/i18n/i18n-provider';
import type { CairoDay } from '@/lib/cairo-time';
import { useUrlParams } from '@/lib/use-url-params';
import { cn } from '@/lib/utils';
import { rangeLabel } from './format-day';
import { MemberTable } from './member-table';
import { OutcomesChart } from './outcomes-chart';
import { rangeParams, rangeQuery, type ResolvedRange } from './range';
import { RangeFilter } from './range-filter';
import { hasActivity, StatTiles } from './stat-tiles';

/** The range in the URL: presets by name, custom ranges as dates; never moves the viewport. */
export function useRangeParams() {
  const { setParams, isPending } = useUrlParams();
  return {
    isPending,
    setPreset: (preset: Parameters<typeof rangeParams>[0]) =>
      setParams(rangeParams(preset)),
  };
}

/** The empty-range state: nothing counted inside the range, with a way to look further back. */
export function EmptyRange({
  onWiden,
  disabled,
}: {
  /** Absent when the range already is the last 30 days. */
  onWiden?: () => void;
  disabled?: boolean;
}) {
  const { t } = useTranslation();
  return (
    <EmptyState
      icon={CalendarSearch}
      title={t('analytics.empty.title')}
      body={t('analytics.empty.body')}
      action={
        onWiden && (
          <Button variant="soft" onClick={onWiden} disabled={disabled}>
            {t('analytics.empty.action')}
          </Button>
        )
      }
    />
  );
}

/** `/analytics`: team totals, the outcomes breakdown and every member, for a range. */
export function AnalyticsView({
  data,
  range,
  today,
}: {
  data: TeamAnalytics;
  range: ResolvedRange;
  today: CairoDay;
}) {
  const { t, locale } = useTranslation();
  const { setPreset, isPending } = useRangeParams();
  const active = hasActivity(data.totals);
  const hrefFor = (m: MemberStats) =>
    `/analytics/members/${m.id}${rangeQuery(range)}`;

  return (
    <div className="grid grid-cols-1 gap-5" data-testid="analytics-page">
      <PageHeader
        title={t('analytics.title')}
        description={
          <bdi className="font-numeric" data-testid="range-label">
            {rangeLabel(data.range.from, data.range.to, locale)}
          </bdi>
        }
      />
      <RangeFilter
        range={range}
        today={today}
        disabled={isPending}
        onPreset={(preset) => setPreset({ preset })}
        onCustom={(custom) => setPreset(custom)}
      />

      <div
        aria-busy={isPending || undefined}
        className={cn(
          'grid grid-cols-1 gap-5 transition-opacity duration-200',
          isPending && 'opacity-60',
        )}
      >
        <section className="grid gap-3" aria-label={t('analytics.team.totals')}>
          <div className="grid gap-0.5">
            <h2 className="type-h2">{t('analytics.team.totals')}</h2>
            <p className="text-[13px] text-muted-foreground">
              {t('analytics.team.totalsNote')}
            </p>
          </div>
          <StatTiles stats={data.totals} label={t('analytics.team.totals')} />
        </section>

        {active ? (
          <OutcomesChart outcomes={data.totals.outcomes} />
        ) : (
          <EmptyRange
            disabled={isPending}
            onWiden={
              range.preset === 'last30'
                ? undefined
                : () => setPreset({ preset: 'last30' })
            }
          />
        )}

        <MemberTable
          members={data.members}
          hrefFor={hrefFor}
          isRefetching={isPending}
        />
      </div>
    </div>
  );
}
