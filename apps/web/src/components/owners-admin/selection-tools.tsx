'use client';

import { createPortal } from 'react-dom';
import { LoaderCircle } from 'lucide-react';
import { OWNER_BULK_MAX } from '@prime-crm/shared';
import { Checkbox } from '@/components/ui/checkbox';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useTranslation } from '@/i18n/i18n-provider';
import { formatNumber } from '@/lib/format';
import { cn } from '@/lib/utils';

/** The sizes offered for "Select next N unassigned". */
export const NEXT_SIZES = [25, 50, 100, 200, 500] as const;

/** What the last bulk pick did, so the bar can say it. */
export type SelectionNote =
  | { kind: 'matching'; selected: number; total: number }
  | { kind: 'next'; selected: number; requested: number }
  | null;

/**
 * Above the table: select this page, select every matching owner (across pages, through
 * `GET /owners/ids`), or the next N unassigned. Each bulk button shows it's working and locks the
 * other while its request runs.
 */
export function SelectionTools({
  pageState,
  onTogglePage,
  total,
  nextSize,
  onNextSize,
  onSelectMatching,
  onSelectNext,
  busy,
  note,
  disabled,
}: {
  pageState: 'none' | 'some' | 'all';
  onTogglePage: (checked: boolean) => void;
  /** Owners matching the filters. */
  total: number;
  nextSize: number;
  onNextSize: (size: number) => void;
  onSelectMatching: () => void;
  onSelectNext: () => void;
  busy: 'matching' | 'next' | null;
  note: SelectionNote;
  disabled?: boolean;
}) {
  const { t } = useTranslation();
  const locked = busy !== null || disabled;

  return (
    <div className="grid gap-2 rounded-lg bg-card p-2 shadow-raised sm:p-3">
      <div className="flex flex-wrap items-center gap-x-2 gap-y-2">
        {/* From md the table's header holds this checkbox. */}
        <label className="flex cursor-pointer items-center pe-2 type-label md:hidden">
          <Checkbox
            checked={pageState === 'all'}
            indeterminate={pageState === 'some'}
            onCheckedChange={onTogglePage}
            label={t('ownersAdmin.selectPage')}
            disabled={disabled}
          />
          <span aria-hidden>{t('ownersAdmin.selectPage')}</span>
        </label>
        <Button
          variant="soft"
          size="sm"
          disabled={locked || total === 0}
          onClick={onSelectMatching}
          data-testid="select-all-matching"
        >
          {busy === 'matching' && (
            <LoaderCircle aria-hidden className="animate-spin" />
          )}
          {t('ownersAdmin.selectAllMatching', {
            total: formatNumber(Math.min(total, OWNER_BULK_MAX)),
          })}
        </Button>
        <div className="flex items-center gap-1.5">
          <Select
            value={String(nextSize)}
            onValueChange={(value) => onNextSize(Number(value))}
            disabled={locked}
          >
            <SelectTrigger
              aria-label={t('ownersAdmin.nextCount')}
              className="h-9 w-22 rounded-pill px-3"
              data-testid="next-size"
            >
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {NEXT_SIZES.map((size) => (
                <SelectItem key={size} value={String(size)}>
                  <span className="font-numeric">{size}</span>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button
            variant="soft"
            size="sm"
            disabled={locked}
            onClick={onSelectNext}
            data-testid="select-next-unassigned"
          >
            {busy === 'next' && (
              <LoaderCircle aria-hidden className="animate-spin" />
            )}
            {t('ownersAdmin.selectNext', { count: formatNumber(nextSize) })}
          </Button>
        </div>
      </div>
      <p
        role="status"
        aria-live="polite"
        className={cn(
          'px-2 text-xs font-semibold text-muted-foreground',
          !note && 'sr-only',
        )}
      >
        {note?.kind === 'matching' &&
          (note.total > note.selected
            ? t('ownersAdmin.cappedSelection', {
                count: formatNumber(note.selected),
                total: formatNumber(note.total),
              })
            : t('ownersAdmin.allMatchingSelected', {
                count: formatNumber(note.selected),
              }))}
        {note?.kind === 'next' &&
          (note.selected === 0
            ? t('ownersAdmin.nextNone')
            : note.selected < note.requested
              ? t('ownersAdmin.nextFewer', {
                  count: formatNumber(note.selected),
                })
              : t('ownersAdmin.nextSelected', {
                  count: formatNumber(note.selected),
                }))}
      </p>
    </div>
  );
}

/**
 * The floating dock that appears once something is selected: the count, Clear, and the one
 * gradient action of the view, Assign. Sits above the phone tab bar; at the end corner from md.
 * Rendered only on the client (after a selection), so `document` exists.
 */
export function SelectionDock({
  count,
  onClear,
  onAssign,
}: {
  count: number;
  onClear: () => void;
  onAssign: () => void;
}) {
  const { t } = useTranslation();
  // Portalled: the shell's content column is its own stacking context on tablets.
  return createPortal(
    <div
      data-testid="selection-dock"
      className={cn(
        // Longhands only: a shorthand `inset-x` would override `md:end-8` (and drop the dock
        // into the page flow) depending on the order Tailwind emits them.
        'fixed start-[max(0.875rem,env(safe-area-inset-left))] end-[max(0.875rem,env(safe-area-inset-right))] bottom-[calc(4.75rem+max(1rem,env(safe-area-inset-bottom)))] z-30',
        'md:start-auto md:end-8 md:bottom-8',
        'animate-in duration-200 fade-in-0 slide-in-from-bottom-2 motion-reduce:slide-in-from-bottom-0',
      )}
    >
      <div className="flex items-center gap-2 rounded-pill border border-border bg-card/85 p-1.5 ps-5 shadow-float backdrop-blur-lg">
        <p className="min-w-0 flex-1 truncate type-label">
          <bdi className="font-numeric tabular-nums">
            {t('ownersAdmin.selectedCount', { count: formatNumber(count) })}
          </bdi>
        </p>
        <Button variant="ghost" size="sm" onClick={onClear}>
          {t('ownersAdmin.clearSelection')}
        </Button>
        <Button onClick={onAssign} data-testid="open-assign">
          {t('ownersAdmin.assign')}
        </Button>
      </div>
    </div>,
    document.body,
  );
}
