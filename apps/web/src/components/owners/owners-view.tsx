'use client';

import { useMemo } from 'react';
import Link from 'next/link';
import { UsersRound } from 'lucide-react';
import {
  LeadStatusSchema,
  SEARCH_MAX_LENGTH,
  type LeadStatus,
  type Meta,
  type OwnerRow as OwnerRowData,
} from '@prime-crm/shared';
import { CallButton } from '@/components/calling/call-button';
import { DataList, type DataColumn } from '@/components/data-list';
import { DateText } from '@/components/date-text';
import { FilterChips } from '@/components/filter-chips';
import { PageHeader } from '@/components/page-header';
import { SearchField } from '@/components/search-field';
import { useSession } from '@/components/session-provider';
import { StatusChip } from '@/components/status-chip';
import { OwnerRow, OwnerRowSkeleton } from '@/components/today/owner-row';
import { useTranslation } from '@/i18n/i18n-provider';
import { formatPhone } from '@/lib/format';
import { useUrlParams } from '@/lib/use-url-params';
import { ownerUrgency, ownerWhen } from '@/lib/when';

type StatusFilter = LeadStatus | 'ALL';

/** Whether the signed-in member can call this owner now (their own, still on a calling list). */
export const canCall = (
  owner: OwnerRowData,
  myId: string | undefined,
): boolean =>
  !!myId &&
  owner.assignedTo?.id === myId &&
  owner.status !== 'LISTED' &&
  owner.status !== 'DO_NOT_CALL';

/**
 * Owners: own owners for a member (search by name or phone, filter by status). Someone with
 * owners.viewAll sees everyone's, with an "Assigned to" column (the full admin table is T15).
 */
export function OwnersView({
  rows,
  meta,
  q,
  status,
  viewAll,
  now: nowIso,
}: {
  rows: OwnerRowData[];
  meta: Meta;
  q: string;
  status: StatusFilter;
  viewAll: boolean;
  now: string;
}) {
  const { t, locale } = useTranslation();
  const me = useSession();
  const { setParams, isPending } = useUrlParams();
  const now = useMemo(() => new Date(nowIso), [nowIso]);
  const filtered = q !== '' || status !== 'ALL';

  const columns: DataColumn<OwnerRowData>[] = [
    {
      id: 'name',
      header: t('owners.name'),
      className: 'w-[26%]',
      cell: (owner) => (
        <Link
          href={`/owners/${owner.id}`}
          title={owner.name}
          className="block truncate font-bold hover:text-primary"
        >
          {owner.name}
        </Link>
      ),
    },
    {
      id: 'phone',
      header: t('owners.phones'),
      cell: (owner) =>
        owner.phones[0] ? (
          <bdi dir="ltr" className="font-numeric tabular-nums">
            {formatPhone(owner.phones[0])}
          </bdi>
        ) : null,
    },
    {
      id: 'area',
      header: t('owners.area'),
      cell: (owner) => owner.area ?? t('owners.noArea'),
    },
    {
      id: 'status',
      header: t('owners.status'),
      cell: (owner) => <StatusChip kind="lead" status={owner.status} />,
    },
    ...(viewAll
      ? [
          {
            id: 'assigned',
            header: t('owners.assignedTo'),
            cell: (owner: OwnerRowData) =>
              owner.assignedTo?.name ?? t('owners.unassigned'),
          },
        ]
      : []),
    {
      id: 'lastCall',
      header: t('owners.lastCall'),
      cell: (owner) =>
        owner.lastCall ? (
          <span className="grid">
            <DateText value={owner.lastCall.at} />
            <span className="truncate text-xs text-muted-foreground">
              {owner.lastCall.outcome.label}
            </span>
          </span>
        ) : (
          t('today.neverCalled')
        ),
    },
    {
      id: 'call',
      header: '',
      className: 'w-32 text-end',
      cell: (owner) =>
        canCall(owner, me?.id) ? <CallButton target={owner} /> : null,
    },
  ];

  const statusOptions = [
    { value: 'ALL' as const, label: t('owners.all') },
    ...LeadStatusSchema.options.map((value) => ({
      value,
      label: t(`leadStatus.${value}`),
    })),
  ];

  return (
    <div className="grid gap-5">
      <PageHeader title={t('owners.title')} />
      <div className="grid gap-3">
        <SearchField
          label={t('owners.searchLabel')}
          placeholder={t('owners.searchPlaceholder')}
          value={q}
          maxLength={SEARCH_MAX_LENGTH}
          pending={isPending}
          onSearch={(next) => setParams({ q: next })}
        />
        <FilterChips
          label={t('owners.statusFilter')}
          options={statusOptions}
          value={status}
          onChange={(next) =>
            setParams({ status: next === 'ALL' ? null : next })
          }
        />
      </div>
      <DataList
        label={t('owners.title')}
        columns={columns}
        rows={rows}
        rowKey={(owner) => owner.id}
        meta={meta}
        isRefetching={isPending}
        renderCard={(owner) => (
          <OwnerRow
            urgency={ownerUrgency(owner, now)}
            name={owner.name}
            href={`/owners/${owner.id}`}
            detail={
              viewAll
                ? `${owner.area ?? t('owners.noArea')}, ${owner.assignedTo?.name ?? t('owners.unassigned')}`
                : (owner.area ?? t('owners.noArea'))
            }
            status={<StatusChip kind="lead" status={owner.status} />}
            when={ownerWhen(t, locale, owner, now)}
            action={
              canCall(owner, me?.id) ? <CallButton target={owner} /> : undefined
            }
          />
        )}
        renderCardSkeleton={() => <OwnerRowSkeleton />}
        empty={{
          icon: UsersRound,
          title: filtered ? t('owners.emptyTitle') : t('owners.emptyMineTitle'),
          body: filtered ? t('owners.emptyBody') : t('owners.emptyMineBody'),
        }}
      />
    </div>
  );
}
