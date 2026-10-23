'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  ArrowDownWideNarrow,
  ArrowUpNarrowWide,
  ChevronRight,
  UsersRound,
} from 'lucide-react';
import type { MemberStats } from '@prime-crm/shared';
import { DataList, type DataColumn } from '@/components/data-list';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useTranslation } from '@/i18n/i18n-provider';
import type { MessageKey } from '@/i18n/translate';
import { formatNumber } from '@/lib/format';
import { cn } from '@/lib/utils';

export const MEMBER_SORT_KEYS = [
  'calls',
  'interestedOwners',
  'remindersDone',
  'remindersOverdue',
  'assignedOwners',
  'listingsCreated',
  'adsLive',
  'adsTakenDown',
  'name',
] as const;
export type MemberSortKey = (typeof MEMBER_SORT_KEYS)[number];
export type SortDirection = 'asc' | 'desc';

/** Members in the chosen order; ties fall back to the name, so the order never jitters. */
export function sortMembers(
  members: readonly MemberStats[],
  key: MemberSortKey,
  direction: SortDirection,
  locale: string,
): MemberStats[] {
  const byName = (a: MemberStats, b: MemberStats) =>
    a.name.localeCompare(b.name, locale);
  const sign = direction === 'asc' ? 1 : -1;
  return [...members].sort((a, b) =>
    key === 'name'
      ? sign * byName(a, b)
      : sign * (a[key] - b[key]) || byName(a, b),
  );
}

type NumberKey = Exclude<MemberSortKey, 'name'>;

/** Which columns the table shows from md, and which wait for lg. */
const COLUMNS: { key: NumberKey; from: 'md' | 'lg' }[] = [
  { key: 'calls', from: 'md' },
  { key: 'interestedOwners', from: 'md' },
  { key: 'remindersDone', from: 'lg' },
  { key: 'remindersOverdue', from: 'md' },
  { key: 'assignedOwners', from: 'md' },
  { key: 'listingsCreated', from: 'lg' },
  { key: 'adsLive', from: 'lg' },
  { key: 'adsTakenDown', from: 'lg' },
];

function MemberName({ member }: { member: MemberStats }) {
  const { t } = useTranslation();
  return (
    <span className="flex min-w-0 items-center gap-2">
      <bdi className="truncate font-semibold">{member.name}</bdi>
      {!member.active && (
        <Badge variant="neutral" className="shrink-0">
          {t('analytics.table.deactivated')}
        </Badge>
      )}
    </span>
  );
}

/**
 * The per-member table: sortable by any stat or the name, deactivated members marked, a row
 * opens that member's analytics for the same range. Cards on phones, a table from md.
 */
export function MemberTable({
  members,
  hrefFor,
  isRefetching,
}: {
  members: readonly MemberStats[];
  hrefFor: (member: MemberStats) => string;
  isRefetching?: boolean;
}) {
  const { t, locale } = useTranslation();
  const router = useRouter();
  const [sortKey, setSortKey] = useState<MemberSortKey>('calls');
  const [direction, setDirection] = useState<SortDirection>('desc');
  const rows = useMemo(
    () => sortMembers(members, sortKey, direction, locale),
    [members, sortKey, direction, locale],
  );

  const statLabel = (key: NumberKey) =>
    t(`analytics.stats.${key}` as MessageKey);

  const columns: DataColumn<MemberStats>[] = [
    {
      id: 'name',
      header: t('analytics.table.member'),
      className: 'min-w-44',
      cell: (m) => (
        <Link
          href={hrefFor(m)}
          aria-label={t('analytics.table.open', { name: m.name })}
          onClick={(event) => event.stopPropagation()}
          className="rounded-sm outline-none focus-visible:ring-4 focus-visible:ring-ring/20"
        >
          <MemberName member={m} />
        </Link>
      ),
    },
    ...COLUMNS.map(({ key, from }) => ({
      id: key,
      header: statLabel(key),
      className: cn(
        'text-end font-numeric tabular-nums',
        from === 'lg' && 'hidden lg:table-cell',
      ),
      cell: (m: MemberStats) => (
        <span
          className={cn(
            key === 'remindersOverdue' &&
              m[key] > 0 &&
              'font-bold text-destructive',
          )}
        >
          {formatNumber(m[key])}
        </span>
      ),
    })),
  ];

  return (
    <section className="grid min-w-0 gap-3" data-testid="member-table">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <h2 className="type-h2">{t('analytics.team.members')}</h2>
        <div className="flex items-center gap-2">
          <Select
            value={sortKey}
            onValueChange={(next) => {
              const key = next as MemberSortKey;
              setSortKey(key);
              setDirection(key === 'name' ? 'asc' : 'desc');
            }}
          >
            <SelectTrigger
              aria-label={t('analytics.table.sortBy')}
              data-testid="member-sort"
              className="w-48"
            >
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {MEMBER_SORT_KEYS.map((key) => (
                <SelectItem key={key} value={key}>
                  {key === 'name' ? t('analytics.table.name') : statLabel(key)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button
            variant="outline"
            size="icon"
            aria-label={t('analytics.table.toggleDirection')}
            title={
              direction === 'asc'
                ? t('analytics.table.ascending')
                : t('analytics.table.descending')
            }
            onClick={() => setDirection((d) => (d === 'asc' ? 'desc' : 'asc'))}
            data-testid="member-sort-direction"
          >
            {direction === 'asc' ? (
              <ArrowUpNarrowWide aria-hidden />
            ) : (
              <ArrowDownWideNarrow aria-hidden />
            )}
          </Button>
        </div>
      </div>
      <DataList
        className="grid-cols-1"
        label={t('analytics.team.members')}
        columns={columns}
        rows={rows}
        rowKey={(m) => m.id}
        isRefetching={isRefetching}
        onRowClick={(m) => router.push(hrefFor(m))}
        renderCard={(m) => (
          <Link
            href={hrefFor(m)}
            aria-label={t('analytics.table.open', { name: m.name })}
            data-testid="member-card"
            className="grid gap-3 rounded-md bg-card p-4 shadow-raised outline-none focus-visible:ring-4 focus-visible:ring-ring/20"
          >
            <span className="flex items-center justify-between gap-3">
              <MemberName member={m} />
              <ChevronRight
                aria-hidden
                className="size-5 shrink-0 flip-rtl text-muted-foreground"
              />
            </span>
            <span className="grid grid-cols-3 gap-2">
              {(['calls', 'interestedOwners', 'remindersOverdue'] as const).map(
                (key) => (
                  <span key={key} className="grid min-w-0 gap-0.5">
                    <span
                      className={cn(
                        'font-numeric text-lg leading-tight font-extrabold tabular-nums',
                        key === 'remindersOverdue' &&
                          m[key] > 0 &&
                          'text-destructive',
                      )}
                    >
                      {formatNumber(m[key])}
                    </span>
                    <span className="truncate text-xs text-muted-foreground">
                      {t(`analytics.table.short.${key}`)}
                    </span>
                  </span>
                ),
              )}
            </span>
          </Link>
        )}
        empty={{ icon: UsersRound, title: t('analytics.empty.noMembers') }}
      />
    </section>
  );
}
