'use client';

import {
  ChevronLeft,
  ChevronRight,
  Inbox,
  type LucideIcon,
} from 'lucide-react';
import type { Meta } from '@prime-crm/shared';
import { EmptyState } from '@/components/empty-state';
import { ListCardSkeleton } from '@/components/skeletons';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { useTranslation } from '@/i18n/i18n-provider';
import { formatNumber } from '@/lib/format';
import { useUrlParams } from '@/lib/use-url-params';
import { cn } from '@/lib/utils';

export interface DataColumn<T> {
  id: string;
  /** Translated column title (also the label in the phone card's default layout). */
  header: string;
  cell: (row: T) => React.ReactNode;
  /** Width / alignment for the table cell and header, e.g. `w-40 text-end`. */
  className?: string;
  /** Leave out of the phone card's default layout. */
  hideOnPhone?: boolean;
}

export interface DataListProps<T> {
  /** Accessible name of the list (the page title usually). */
  label: string;
  columns: readonly DataColumn<T>[];
  /** `undefined` while the first page loads → skeleton rows in the real rows' shape. */
  rows: readonly T[] | undefined;
  rowKey: (row: T) => string;
  /** The phone layout of one row. Default: the columns stacked as label / value pairs. */
  renderCard?: (row: T) => React.ReactNode;
  /** Skeleton matching `renderCard`, when it differs from the default card. */
  renderCardSkeleton?: () => React.ReactNode;
  /** Pagination from the API; pages are a `page` URL param, changed without scrolling. */
  meta?: Meta;
  /** Data already shown is being refreshed (a filter changed): rows stay, dimmed. */
  isRefetching?: boolean;
  /** How many skeleton rows the first load shows: one page's worth. */
  skeletonRows?: number;
  empty: {
    icon?: LucideIcon;
    title?: string;
    body?: string;
    action?: React.ReactNode;
  };
  onRowClick?: (row: T) => void;
  className?: string;
}

/**
 * The shared list: a table from md up, cards on phones, skeleton rows on first load, an empty
 * state, dimmed rows while the next page or filter loads, and URL pagination that never moves the
 * viewport. Pages describe their columns; this owns everything that looks and behaves the same.
 */
export function DataList<T>({
  label,
  columns,
  rows,
  rowKey,
  renderCard,
  renderCardSkeleton,
  meta,
  isRefetching = false,
  skeletonRows = 10,
  empty,
  onRowClick,
  className,
}: DataListProps<T>) {
  const { t } = useTranslation();
  const { setParams, isPending } = useUrlParams();
  const loading = rows === undefined;
  const dimmed = !loading && (isRefetching || isPending);

  if (rows && rows.length === 0 && !dimmed) {
    return (
      <EmptyState
        icon={empty.icon ?? Inbox}
        title={empty.title ?? t('list.emptyTitle')}
        body={empty.body}
        action={empty.action}
        className={className}
      />
    );
  }

  const placeholders = Array.from({ length: skeletonRows }, (_, i) => i);
  const clickable = onRowClick
    ? 'cursor-pointer transition-colors duration-150 hover:bg-accent/60'
    : undefined;

  return (
    <section
      aria-label={label}
      aria-busy={loading || dimmed || undefined}
      className={cn('grid gap-3', className)}
    >
      {/* Phones: cards */}
      <ul
        className={cn(
          'grid gap-2.5 md:hidden',
          dimmed && 'opacity-60 transition-opacity',
        )}
      >
        {loading
          ? placeholders.map((i) => (
              <li key={i}>
                {renderCardSkeleton ? (
                  renderCardSkeleton()
                ) : (
                  <ListCardSkeleton />
                )}
              </li>
            ))
          : rows.map((row) => (
              <li key={rowKey(row)}>
                {renderCard ? (
                  renderCard(row)
                ) : (
                  <div
                    onClick={onRowClick ? () => onRowClick(row) : undefined}
                    className={cn(
                      'grid gap-2 rounded-md bg-card p-4 shadow-raised',
                      clickable,
                    )}
                  >
                    {columns
                      .filter((c) => !c.hideOnPhone)
                      .map((c) => (
                        <div
                          key={c.id}
                          className="flex min-w-0 items-baseline justify-between gap-3"
                        >
                          <span className="shrink-0 text-xs font-semibold text-muted-foreground">
                            {c.header}
                          </span>
                          <span className="min-w-0 truncate text-end text-sm">
                            {c.cell(row)}
                          </span>
                        </div>
                      ))}
                  </div>
                )}
              </li>
            ))}
      </ul>

      {/* Tablet and up: a table in a card; the scroll region is inset so its bar stays inside. */}
      <div className="hidden rounded-lg bg-card py-2 shadow-raised md:block">
        <div className="mx-1.5 scrollbar-clean overflow-x-auto">
          <table
            className={cn(
              'w-full border-collapse text-sm',
              dimmed && 'opacity-60 transition-opacity',
            )}
          >
            <thead>
              <tr>
                {columns.map((c) => (
                  <th
                    key={c.id}
                    scope="col"
                    className={cn(
                      'px-3 py-2.5 text-start text-xs font-semibold whitespace-nowrap text-muted-foreground',
                      c.className,
                    )}
                  >
                    {c.header}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {loading
                ? placeholders.map((i) => (
                    <tr key={i} className="border-t border-border">
                      {columns.map((c) => (
                        <td
                          key={c.id}
                          className={cn('px-3 py-3.5', c.className)}
                        >
                          <Skeleton className="h-4 w-3/4 rounded-pill" />
                        </td>
                      ))}
                    </tr>
                  ))
                : rows.map((row) => (
                    <tr
                      key={rowKey(row)}
                      onClick={onRowClick ? () => onRowClick(row) : undefined}
                      className={cn('border-t border-border', clickable)}
                    >
                      {columns.map((c) => (
                        <td
                          key={c.id}
                          className={cn(
                            'max-w-80 truncate px-3 py-3.5',
                            c.className,
                          )}
                        >
                          {c.cell(row)}
                        </td>
                      ))}
                    </tr>
                  ))}
            </tbody>
          </table>
        </div>
      </div>

      {meta && (meta.hasNextPage || meta.hasPreviousPage) && (
        <Pagination
          meta={meta}
          disabled={isPending}
          onPage={(page) => setParams({ page })}
        />
      )}
    </section>
  );
}

function Pagination({
  meta,
  disabled,
  onPage,
}: {
  meta: Meta;
  disabled: boolean;
  onPage: (page: number) => void;
}) {
  const { t } = useTranslation();
  const pages = Math.max(1, Math.ceil(meta.total / meta.limit));
  const from = (meta.page - 1) * meta.limit + 1;
  const to = Math.min(meta.page * meta.limit, meta.total);

  return (
    <nav
      aria-label={t('list.pagination')}
      className="flex items-center justify-between gap-3"
    >
      <p className="text-xs font-semibold text-muted-foreground">
        <bdi className="font-numeric tabular-nums">
          {t('list.range', {
            from: formatNumber(from),
            to: formatNumber(to),
            total: formatNumber(meta.total),
          })}
        </bdi>
      </p>
      <div className="flex items-center gap-2">
        <span className="sr-only">
          {t('list.pageOf', { page: meta.page, pages })}
        </span>
        <Button
          variant="outline"
          size="icon"
          aria-label={t('list.previous')}
          disabled={disabled || !meta.hasPreviousPage}
          onClick={() => onPage(meta.page - 1)}
        >
          <ChevronLeft aria-hidden className="flip-rtl" />
        </Button>
        <Button
          variant="outline"
          size="icon"
          aria-label={t('list.next')}
          disabled={disabled || !meta.hasNextPage}
          onClick={() => onPage(meta.page + 1)}
        >
          <ChevronRight aria-hidden className="flip-rtl" />
        </Button>
      </div>
    </nav>
  );
}
