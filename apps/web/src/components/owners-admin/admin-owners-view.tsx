'use client';

import { useMemo, useState, useTransition } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { FileUp, UsersRound } from 'lucide-react';
import {
  OWNER_BULK_MAX,
  type Meta,
  type OwnerRow as OwnerRowData,
  type UserSummary,
} from '@prime-crm/shared';
import { GET_OWNER_IDS } from '@/apis';
import { ExportButton } from '@/components/analytics/export-button';
import { DataList, type DataColumn } from '@/components/data-list';
import { DateText } from '@/components/date-text';
import { PageHeader } from '@/components/page-header';
import { AssignDialog } from '@/components/owners-admin/assign-dialog';
import {
  filtersKey,
  isFiltered,
  ownerQueryOf,
  type OwnerFilters,
} from '@/components/owners-admin/owner-filters';
import {
  OwnersFilters,
  type FilterOption,
} from '@/components/owners-admin/owners-filters';
import { SelectCheckbox } from '@/components/owners-admin/select-checkbox';
import {
  SelectionDock,
  SelectionTools,
  type SelectionNote,
} from '@/components/owners-admin/selection-tools';
import { StatusChip } from '@/components/status-chip';
import { OwnerRow, OwnerRowSkeleton } from '@/components/today/owner-row';
import { Button } from '@/components/ui/button';
import { useTranslation } from '@/i18n/i18n-provider';
import { isUnauthorized } from '@/lib/api-result';
import { callApi } from '@/lib/callApi';
import { formatNumber, formatPhone } from '@/lib/format';
import { useUrlParams, type ParamUpdates } from '@/lib/use-url-params';
import { ownerUrgency, ownerWhen } from '@/lib/when';

/**
 * Owners for whoever sees all of them or assigns them: every filter of `GET /owners` in the URL, a
 * table from md and cards on phones, and (with owners.assign) a selection that survives paging —
 * this page, every matching owner, or the next N unassigned — assigned in one dialog.
 */
export function AdminOwnersView({
  rows,
  meta,
  filters,
  members,
  areas,
  imports,
  canAssign,
  canImport,
  now: nowIso,
}: {
  rows: OwnerRowData[];
  meta: Meta;
  filters: OwnerFilters;
  members: readonly UserSummary[];
  areas: readonly string[];
  imports: readonly FilterOption[];
  canAssign: boolean;
  canImport: boolean;
  now: string;
}) {
  const { t, locale } = useTranslation();
  const router = useRouter();
  const { setParams, isPending: filtering } = useUrlParams();
  const [refreshing, startRefresh] = useTransition();
  const isPending = filtering || refreshing;
  const now = useMemo(() => new Date(nowIso), [nowIso]);

  const key = filtersKey(filters);
  const [selection, setSelection] = useState<{
    key: string;
    ids: ReadonlySet<string>;
  }>({ key, ids: new Set() });
  // A selection made under other filters no longer describes this list.
  const selected = selection.key === key ? selection.ids : new Set<string>();
  const [note, setNote] = useState<SelectionNote>(null);
  const [busy, setBusy] = useState<'matching' | 'next' | null>(null);
  const [nextSize, setNextSize] = useState(50);
  const [assignOpen, setAssignOpen] = useState(false);

  const replace = (ids: Iterable<string>, nextNote: SelectionNote = null) => {
    setSelection({ key, ids: new Set(ids) });
    setNote(nextNote);
  };
  const toggle = (id: string, on: boolean) => {
    const next = new Set(selected);
    if (on) next.add(id);
    else next.delete(id);
    replace(next);
  };
  const onPage = rows.filter((row) => selected.has(row.id)).length;
  const pageState =
    onPage === 0 ? 'none' : onPage === rows.length ? 'all' : 'some';
  const togglePage = (on: boolean) => {
    const next = new Set(selected);
    for (const row of rows) {
      if (on) next.add(row.id);
      else next.delete(row.id);
    }
    replace(next);
  };

  async function pickIds(
    kind: 'matching' | 'next',
    query: Record<string, unknown>,
  ) {
    if (busy) return;
    setBusy(kind);
    try {
      const res = await callApi(GET_OWNER_IDS(query));
      if (isUnauthorized(res) || !res.success) return;
      const { ids, total } = res.data;
      replace(
        ids,
        kind === 'matching'
          ? { kind, selected: ids.length, total }
          : { kind, selected: ids.length, requested: nextSize },
      );
    } finally {
      setBusy(null);
    }
  }

  const changeFilters = (updates: ParamUpdates) => {
    setNote(null);
    setParams(updates);
  };

  const ownerHref = (owner: OwnerRowData) => `/owners/${owner.id}`;
  const assignedName = (owner: OwnerRowData) =>
    owner.assignedTo?.name ?? t('owners.unassigned');

  const columns: DataColumn<OwnerRowData>[] = [
    ...(canAssign
      ? [
          {
            id: 'select',
            header: '',
            className: 'w-12 px-1',
            cell: (owner: OwnerRowData) => (
              <SelectCheckbox
                checked={selected.has(owner.id)}
                onCheckedChange={(on) => toggle(owner.id, on)}
                label={t('ownersAdmin.selectRow', { name: owner.name })}
              />
            ),
          },
        ]
      : []),
    {
      id: 'name',
      header: t('owners.name'),
      className: 'min-w-44',
      cell: (owner) => (
        <Link
          href={ownerHref(owner)}
          title={owner.name}
          className="block truncate font-bold hover:text-primary"
        >
          <bdi>{owner.name}</bdi>
        </Link>
      ),
    },
    {
      id: 'phone',
      header: t('owners.phones'),
      // Tablets with the sidebar keep who / where / status / assignee in view.
      className: 'hidden xl:table-cell',
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
    {
      id: 'assigned',
      header: t('owners.assignedTo'),
      cell: (owner) => (
        <span
          className={owner.assignedTo ? undefined : 'text-muted-foreground'}
        >
          <bdi>{assignedName(owner)}</bdi>
        </span>
      ),
    },
    {
      id: 'lastCall',
      header: t('owners.lastCall'),
      className: 'hidden lg:table-cell',
      cell: (owner) =>
        owner.lastCall ? (
          <span className="grid">
            <DateText value={owner.lastCall.at} />
            <span className="truncate text-xs text-muted-foreground">
              {owner.lastCall.outcome.label}
            </span>
          </span>
        ) : (
          <span className="text-muted-foreground">
            {t('today.neverCalled')}
          </span>
        ),
    },
  ];

  const filtered = isFiltered(filters);
  const count = selected.size;

  return (
    <div
      className={
        canAssign && count > 0
          ? 'grid grid-cols-1 gap-5 pb-20'
          : 'grid grid-cols-1 gap-5'
      }
    >
      <PageHeader
        title={t('owners.title')}
        description={
          <bdi className="font-numeric tabular-nums">
            {t('ownersAdmin.total', { total: formatNumber(meta.total) })}
          </bdi>
        }
        actions={
          canImport ? (
            <Button variant="soft" asChild>
              <Link href="/imports/new">
                <FileUp aria-hidden />
                {t('ownersAdmin.importOwners')}
              </Link>
            </Button>
          ) : undefined
        }
      />
      <ExportButton
        kind="owners"
        showLabel
        className="-mt-2 justify-self-end"
      />
      <OwnersFilters
        filters={filters}
        members={members}
        areas={areas}
        imports={imports}
        pending={isPending}
        onChange={changeFilters}
      />
      {canAssign && (
        <SelectionTools
          pageState={rows.length === 0 ? 'none' : pageState}
          onTogglePage={togglePage}
          total={meta.total}
          nextSize={nextSize}
          onNextSize={setNextSize}
          busy={busy}
          note={note}
          disabled={isPending || rows.length === 0}
          onSelectMatching={() =>
            void pickIds('matching', {
              ...ownerQueryOf(filters),
              take: OWNER_BULK_MAX,
            })
          }
          onSelectNext={() =>
            void pickIds('next', {
              ...ownerQueryOf(filters),
              assignedTo: 'unassigned',
              take: nextSize,
            })
          }
        />
      )}
      <DataList
        className="grid-cols-1"
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
            href={ownerHref(owner)}
            detail={`${owner.area ?? t('owners.noArea')}, ${assignedName(owner)}`}
            status={<StatusChip kind="lead" status={owner.status} />}
            when={ownerWhen(t, locale, owner, now)}
            action={
              canAssign ? (
                <SelectCheckbox
                  checked={selected.has(owner.id)}
                  onCheckedChange={(on) => toggle(owner.id, on)}
                  label={t('ownersAdmin.selectRow', { name: owner.name })}
                />
              ) : undefined
            }
          />
        )}
        renderCardSkeleton={() => <OwnerRowSkeleton action={canAssign} />}
        empty={{
          icon: UsersRound,
          title: filtered
            ? t('owners.emptyTitle')
            : t('ownersAdmin.emptyAllTitle'),
          body: filtered
            ? t('ownersAdmin.emptyFilteredBody')
            : t('ownersAdmin.emptyAllBody'),
          action:
            !filtered && canImport ? (
              <Button variant="soft" asChild>
                <Link href="/imports/new">{t('ownersAdmin.importOwners')}</Link>
              </Button>
            ) : undefined,
        }}
      />
      {canAssign && count > 0 && (
        <SelectionDock
          count={count}
          onClear={() => replace([])}
          onAssign={() => setAssignOpen(true)}
        />
      )}
      {canAssign && (
        <AssignDialog
          open={assignOpen}
          onOpenChange={setAssignOpen}
          ownerIds={[...selected]}
          onAssigned={() => {
            replace([]);
            startRefresh(() => router.refresh());
          }}
        />
      )}
    </div>
  );
}
