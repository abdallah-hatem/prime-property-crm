'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Plus, SearchX, SlidersHorizontal, Search } from 'lucide-react';
import type { ListingRow, Meta } from '@prime-crm/shared';
import { ExportButton } from '@/components/analytics/export-button';
import { DataList, type DataColumn } from '@/components/data-list';
import { EmptyState } from '@/components/empty-state';
import { PageHeader } from '@/components/page-header';
import { useCan } from '@/components/session-provider';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useTranslation } from '@/i18n/i18n-provider';
import { formatNumber } from '@/lib/format';
import { useUrlParams } from '@/lib/use-url-params';
import { BottomSheet } from '@/components/ui/bottom-sheet';
import {
  activeFilterCount,
  EMPTY_FILTERS,
  invalidRanges,
  parseFilters,
  toParamUpdates,
  type ListingFilters,
} from './filters-url';
import { ListingCover } from './listing-cover';
import { ListingFactsLine } from './listing-facts';
import { ListingFiltersForm } from './listing-filters';
import {
  ListingChips,
  ListingPrice,
  ListingRowCard,
  ListingRowCardSkeleton,
} from './listing-row-card';

const SEARCH_DELAY_MS = 400;

/**
 * Client search over every listing. All state is in the URL (changed with `scroll: false`, so
 * nothing jumps): the search box applies as you type, the filters apply from a bottom sheet on
 * phones and tablets or a side panel on wide screens. Rows stay on screen, dimmed, while the
 * next page or filter loads.
 */
export function ListingSearch({
  rows,
  meta,
  failed = false,
}: {
  rows: ListingRow[] | undefined;
  meta?: Meta;
  failed?: boolean;
}) {
  const { t } = useTranslation();
  const router = useRouter();
  const canCreate = useCan('listings.create');
  const { searchParams, setParams, isPending } = useUrlParams();
  const urlKey = searchParams.toString();
  const applied = useMemo(() => parseFilters(searchParams), [searchParams]);

  const [sheetOpen, setSheetOpen] = useState(false);
  const [draft, setDraft] = useState<ListingFilters>(applied);
  const [query, setQuery] = useState(applied.q);
  /** The last search text this box sent, so its own URL change doesn't overwrite typing. */
  const [sentQuery, setSentQuery] = useState(applied.q);
  const [syncedKey, setSyncedKey] = useState(urlKey);

  // The URL is the truth: a back button, a reload or another control re-syncs the draft.
  if (syncedKey !== urlKey) {
    setSyncedKey(urlKey);
    setDraft(applied);
    if (applied.q !== sentQuery) {
      setSentQuery(applied.q);
      setQuery(applied.q);
    }
  }

  useEffect(() => {
    const text = query.trim();
    if (text === sentQuery.trim()) return;
    const timer = setTimeout(() => {
      setSentQuery(text);
      setParams({ q: text || null });
    }, SEARCH_DELAY_MS);
    return () => clearTimeout(timer);
  }, [query, sentQuery, setParams]);

  const invalid = invalidRanges(draft);
  const activeCount = activeFilterCount(applied);

  function apply(next: ListingFilters = draft) {
    if (invalidRanges(next).length > 0) return;
    setParams(toParamUpdates({ ...next, q: query }));
    setSheetOpen(false);
  }

  function clearAll() {
    const cleared = { ...EMPTY_FILTERS, q: query };
    setDraft(cleared);
    setParams(toParamUpdates(cleared));
    setSheetOpen(false);
  }

  const columns: DataColumn<ListingRow>[] = [
    {
      id: 'home',
      header: t('listings.column.home'),
      className: 'w-[52%]',
      cell: (row) => (
        <span className="flex min-w-0 items-center gap-3">
          <ListingCover
            url={row.coverPhotoUrl}
            alt={row.title}
            className="h-12 w-16 shrink-0 rounded-sm"
            iconClassName="size-5"
          />
          <span className="grid min-w-40">
            <Link
              href={`/listings/${row.id}`}
              className="truncate font-bold outline-none hover:underline focus-visible:underline"
              onClick={(event) => event.stopPropagation()}
            >
              {row.title}
            </Link>
            {row.compound && (
              <span className="truncate text-xs text-muted-foreground">
                {row.compound}
              </span>
            )}
            <ListingFactsLine facts={row} className="mt-1 text-xs" />
          </span>
        </span>
      ),
    },
    {
      id: 'price',
      header: t('listings.column.price'),
      cell: (row) => (
        <ListingPrice
          price={row.price}
          purpose={row.purpose}
          className="font-bold"
          stacked
        />
      ),
    },
    {
      id: 'status',
      header: t('listings.column.status'),
      cell: (row) => <ListingChips row={row} />,
    },
  ];

  const filterForm = (
    <ListingFiltersForm value={draft} onChange={setDraft} invalid={invalid} />
  );
  const applyButtons = (
    <>
      <Button variant="secondary" className="flex-1" onClick={clearAll}>
        {t('listings.clearFilters')}
      </Button>
      <Button
        className="flex-1"
        disabled={invalid.length > 0}
        onClick={() => apply()}
        data-testid="apply-filters"
      >
        {t('listings.showResults')}
      </Button>
    </>
  );

  return (
    <div className="grid grid-cols-1 gap-5">
      <PageHeader
        title={t('listings.title')}
        description={
          meta ? (
            <bdi
              className="font-numeric tabular-nums"
              data-testid="listing-count"
            >
              {t('listings.count', { count: formatNumber(meta.total) })}
            </bdi>
          ) : undefined
        }
        actions={
          canCreate ? (
            <Button asChild>
              <Link href="/listings/new" data-testid="new-listing">
                <Plus aria-hidden />
                {t('listings.newListing')}
              </Link>
            </Button>
          ) : undefined
        }
      />

      <div className="flex items-center gap-2">
        <div className="relative min-w-0 flex-1">
          <Search
            aria-hidden
            className="pointer-events-none absolute start-4 top-1/2 size-[18px] -translate-y-1/2 text-muted-foreground"
          />
          <Input
            type="search"
            aria-label={t('listings.searchLabel')}
            placeholder={t('listings.searchPlaceholder')}
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            className="rounded-pill ps-11"
            data-testid="listing-search"
          />
        </div>
        <Button
          variant="outline"
          className="relative xl:hidden"
          onClick={() => {
            setDraft(applied);
            setSheetOpen(true);
          }}
          data-testid="open-filters"
        >
          <SlidersHorizontal aria-hidden />
          <span className="max-sm:sr-only">{t('listings.filters')}</span>
          {activeCount > 0 && (
            <span className="grid h-5 min-w-5 place-items-center rounded-pill bg-primary px-1 font-numeric text-[11px] text-primary-foreground tabular-nums">
              {activeCount}
            </span>
          )}
        </Button>
        <ExportButton kind="listings" />
      </div>

      <div className="xl:grid xl:grid-cols-[19rem_minmax(0,1fr)] xl:items-start xl:gap-6">
        <aside
          aria-label={t('listings.filters')}
          className="sticky top-6 hidden max-h-[calc(100dvh-3rem)] flex-col rounded-lg bg-card shadow-raised xl:flex"
        >
          <div className="mx-1.5 scrollbar-clean min-h-0 flex-1 overflow-y-auto overscroll-contain px-3.5 pt-5 pb-4">
            {filterForm}
          </div>
          <div className="flex shrink-0 gap-2 border-t border-border p-4">
            {applyButtons}
          </div>
        </aside>

        {failed ? (
          <EmptyState
            tone="error"
            icon={SearchX}
            title={t('listings.loadError')}
            action={
              <Button variant="soft" onClick={() => router.refresh()}>
                {t('action.retry')}
              </Button>
            }
          />
        ) : (
          <DataList
            label={t('listings.title')}
            columns={columns}
            rows={rows}
            rowKey={(row) => row.id}
            renderCard={(row) => <ListingRowCard row={row} />}
            renderCardSkeleton={() => <ListingRowCardSkeleton />}
            skeletonRows={4}
            meta={meta}
            isRefetching={isPending}
            onRowClick={(row) => router.push(`/listings/${row.id}`)}
            empty={{
              icon: SearchX,
              title: t('listings.emptyTitle'),
              body: t('listings.emptyBody'),
              action:
                activeCount > 0 ? (
                  <Button variant="soft" onClick={clearAll}>
                    {t('listings.clearFilters')}
                  </Button>
                ) : undefined,
            }}
          />
        )}
      </div>

      <BottomSheet
        open={sheetOpen}
        onOpenChange={setSheetOpen}
        title={t('listings.filters')}
        closeLabel={t('dialog.close')}
        footer={applyButtons}
      >
        {filterForm}
      </BottomSheet>
    </div>
  );
}
