'use client';

import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import type { MemberAnalytics } from '@prime-crm/shared';
import { PageHeader } from '@/components/page-header';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { useTranslation } from '@/i18n/i18n-provider';
import type { CairoDay } from '@/lib/cairo-time';
import { cn } from '@/lib/utils';
import { EmptyRange, useRangeParams } from './analytics-view';
import { CallsByDayChart } from './calls-by-day-chart';
import { rangeLabel } from './format-day';
import { OutcomesChart } from './outcomes-chart';
import { rangeQuery, type ResolvedRange } from './range';
import { RangeFilter } from './range-filter';
import { hasActivity, StatTiles } from './stat-tiles';

/** `/analytics/members/:id`: one member's stats for the range, and their calls by day. */
export function MemberView({
  data,
  range,
  today,
}: {
  data: MemberAnalytics;
  range: ResolvedRange;
  today: CairoDay;
}) {
  const { t, locale } = useTranslation();
  const { setPreset, isPending } = useRangeParams();
  const active = hasActivity(data);

  return (
    <div className="grid grid-cols-1 gap-5" data-testid="member-analytics">
      <Button
        variant="ghost"
        size="sm"
        asChild
        className="-ms-3 justify-self-start"
      >
        <Link href={`/analytics${rangeQuery(range)}`}>
          <ArrowLeft aria-hidden className="flip-rtl" />
          {t('analytics.member.back')}
        </Link>
      </Button>
      <PageHeader
        title={data.name}
        description={
          <bdi className="font-numeric" data-testid="range-label">
            {rangeLabel(data.range.from, data.range.to, locale)}
          </bdi>
        }
        actions={
          data.active ? undefined : (
            <Badge variant="neutral">{t('analytics.table.deactivated')}</Badge>
          )
        }
      />
      {!data.active && (
        <p className="-mt-2 text-sm text-muted-foreground">
          {t('analytics.member.deactivatedNote')}
        </p>
      )}
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
        <StatTiles stats={data} label={data.name} />
        {active ? (
          <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
            <CallsByDayChart byDay={data.byDay} />
            <OutcomesChart outcomes={data.outcomes} />
          </div>
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
      </div>
    </div>
  );
}
