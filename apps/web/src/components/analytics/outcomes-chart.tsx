'use client';

import type { Stats } from '@prime-crm/shared';
import { Skeleton } from '@/components/ui/skeleton';
import { useTranslation } from '@/i18n/i18n-provider';
import { formatNumber } from '@/lib/format';
import { ChartCard } from './chart-card';

/**
 * Outcomes breakdown: one horizontal bar per outcome, longest first, from the start edge (so the
 * bars grow right-to-left in Arabic). A single series: no legend, every bar labelled with its
 * count and share, so nothing depends on hover.
 */
export function OutcomesChart({ outcomes }: { outcomes: Stats['outcomes'] }) {
  const { t } = useTranslation();
  const rows = outcomes
    .filter((o) => o.count > 0)
    .sort((a, b) => b.count - a.count);
  const total = rows.reduce((sum, o) => sum + o.count, 0);
  const max = rows[0]?.count ?? 0;

  return (
    <ChartCard
      title={t('analytics.outcomes.title')}
      subtitle={t('analytics.outcomes.subtitle')}
      testId="outcomes-chart"
    >
      {rows.length === 0 ? (
        <p className="py-6 text-center text-sm text-muted-foreground">
          {t('analytics.outcomes.empty')}
        </p>
      ) : (
        <ul className="grid gap-3.5">
          {rows.map((o) => {
            const percent = Math.round((o.count / total) * 100);
            return (
              <li key={o.outcomeId} className="grid gap-1.5">
                <div className="flex min-w-0 items-baseline justify-between gap-3 text-sm">
                  <bdi className="min-w-0 truncate">{o.label}</bdi>
                  <span className="flex shrink-0 items-baseline gap-1.5 text-muted-foreground">
                    <span className="font-numeric font-bold text-foreground tabular-nums">
                      {formatNumber(o.count)}
                    </span>
                    <span
                      className="font-numeric text-xs tabular-nums"
                      title={t('analytics.outcomes.share', { percent })}
                    >
                      {percent}%
                    </span>
                  </span>
                </div>
                <div aria-hidden className="h-2.5">
                  <div
                    className="h-full rounded-e-[4px] bg-chart-1"
                    style={{
                      width: `${Math.max(2, (o.count / max) * 100)}%`,
                    }}
                  />
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </ChartCard>
  );
}

/** Same box as OutcomesChart with five bars. */
export function OutcomesChartSkeleton() {
  return (
    <ChartCard.Skeleton>
      <div className="grid gap-3.5">
        {[90, 70, 50, 35, 20].map((width) => (
          <div key={width} className="grid gap-1.5">
            <div className="flex justify-between">
              <Skeleton className="h-4 w-28 rounded-pill" />
              <Skeleton className="h-4 w-12 rounded-pill" />
            </div>
            <Skeleton className="h-2.5" style={{ width: `${width}%` }} />
          </div>
        ))}
      </div>
    </ChartCard.Skeleton>
  );
}
