'use client';

import type { Stats } from '@prime-crm/shared';
import { Skeleton } from '@/components/ui/skeleton';
import { useTranslation } from '@/i18n/i18n-provider';
import type { MessageKey } from '@/i18n/translate';
import { formatNumber } from '@/lib/format';
import { cn } from '@/lib/utils';

type CountKey = Exclude<keyof Stats, 'outcomes'>;

interface TileSpec {
  key: CountKey;
  /** Counted at the end of the range rather than inside it. */
  atEnd?: boolean;
  /** Red when above zero (overdue is the one red counter, docs/DESIGN.md). */
  alarm?: boolean;
}

/** The order the tiles read in: the day's work first, then what stands at the end. */
export const STAT_TILES: readonly TileSpec[] = [
  { key: 'calls' },
  { key: 'interestedOwners' },
  { key: 'remindersDone' },
  { key: 'remindersOverdue', atEnd: true, alarm: true },
  { key: 'assignedOwners', atEnd: true },
  { key: 'listingsCreated' },
  { key: 'adsLive', atEnd: true },
  { key: 'adsTakenDown' },
];

/** Stats counted inside the range; all zero means nothing happened in it. */
const EVENT_KEYS: readonly CountKey[] = [
  'calls',
  'remindersDone',
  'interestedOwners',
  'listingsCreated',
  'adsTakenDown',
];

export const hasActivity = (stats: Stats): boolean =>
  EVENT_KEYS.some((key) => stats[key] > 0);

const tileGrid = 'grid grid-cols-2 gap-2.5 md:grid-cols-4';

/** Eight counters for a Stats: label, value, and "at the end of the range" where it applies. */
export function StatTiles({ stats, label }: { stats: Stats; label: string }) {
  const { t } = useTranslation();
  return (
    <dl aria-label={label} className={tileGrid}>
      {STAT_TILES.map(({ key, atEnd, alarm }) => {
        const value = stats[key];
        return (
          <div
            key={key}
            data-testid={`stat-${key}`}
            className="flex min-w-0 flex-col justify-between gap-3 rounded-md bg-card p-4 shadow-raised"
          >
            <dt className="type-caption text-muted-foreground">
              {t(`analytics.stats.${key}` as MessageKey)}
            </dt>
            <dd className="grid gap-1">
              <span
                className={cn(
                  'font-numeric text-[28px] leading-none font-extrabold tracking-tight',
                  alarm && value > 0 && 'text-destructive',
                )}
              >
                {formatNumber(value)}
              </span>
              <span
                className={cn(
                  'type-caption text-muted-foreground',
                  !atEnd && 'invisible',
                )}
                aria-hidden={!atEnd || undefined}
              >
                {t('analytics.hints.atEnd')}
              </span>
            </dd>
          </div>
        );
      })}
    </dl>
  );
}

/** Same boxes as StatTiles. */
export function StatTilesSkeleton() {
  return (
    <div className={tileGrid}>
      {STAT_TILES.map(({ key }) => (
        <div
          key={key}
          className="flex flex-col justify-between gap-3 rounded-md bg-card p-4 shadow-raised"
        >
          <Skeleton className="h-3.5 w-20 rounded-pill" />
          <div className="grid gap-1.5">
            <Skeleton className="h-7 w-12 rounded-pill" />
            <Skeleton className="h-3.5 w-24 rounded-pill" />
          </div>
        </div>
      ))}
    </div>
  );
}
