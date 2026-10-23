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

// auto-rows-fr: every row as tall as the tallest, so tiles line up whatever their captions do.
const tileGrid = 'grid auto-rows-fr grid-cols-2 gap-2.5 md:grid-cols-4';
/**
 * Label on top, number, then the "at the end" hint at the bottom. Label and hint each hold two
 * lines on phones (clamped, so a long Arabic caption can't push the tile taller), which keeps
 * every number on the same line across a row.
 */
const tileBox =
  'flex min-w-0 flex-col gap-2 rounded-md bg-card p-4 shadow-raised';
const twoLines = 'line-clamp-2 min-h-[2lh] md:min-h-0';

/** Eight counters for a Stats: label, value, and "at the end of the range" where it applies. */
export function StatTiles({ stats, label }: { stats: Stats; label: string }) {
  const { t } = useTranslation();
  return (
    <dl aria-label={label} className={tileGrid}>
      {STAT_TILES.map(({ key, atEnd, alarm }) => {
        const value = stats[key];
        return (
          <div key={key} data-testid={`stat-${key}`} className={tileBox}>
            <dt className={cn('type-caption text-muted-foreground', twoLines)}>
              {t(`analytics.stats.${key}` as MessageKey)}
            </dt>
            <dd className="flex flex-1 flex-col gap-1">
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
                  'mt-auto type-caption text-muted-foreground',
                  twoLines,
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
        <div key={key} className={cn(tileBox, 'justify-between')}>
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
