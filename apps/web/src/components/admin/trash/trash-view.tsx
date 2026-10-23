'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  Building2,
  Image as ImageIcon,
  LoaderCircle,
  RotateCcw,
  Trash2,
  UserRound,
  type LucideIcon,
} from 'lucide-react';
import type { Meta, TrashKind } from '@prime-crm/shared';
import { RESTORE_TRASH_ITEM, type TrashItem } from '@/apis';
import { useAction } from '@/components/admin/admin-ui';
import { DataList, type DataColumn } from '@/components/data-list';
import { DateText } from '@/components/date-text';
import { FilterChips } from '@/components/filter-chips';
import { PageHeader } from '@/components/page-header';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { useTranslation } from '@/i18n/i18n-provider';
import { isUnauthorized } from '@/lib/api-result';
import { callApi } from '@/lib/callApi';
import { errorMessage } from '@/lib/error-message';
import { formatNumber } from '@/lib/format';
import { useUrlParams } from '@/lib/use-url-params';

export type TrashFilter = TrashKind | 'ALL';

const DAY_MS = 24 * 60 * 60 * 1000;

/** Whole days before the item is removed for good (0 = its last day). */
export const daysLeft = (purgeAt: string, now: Date): number =>
  Math.max(
    0,
    Math.floor((new Date(purgeAt).getTime() - now.getTime()) / DAY_MS),
  );

const KIND_ICON: Record<TrashKind, LucideIcon> = {
  OWNER: UserRound,
  LISTING: Building2,
  PHOTO: ImageIcon,
};

/**
 * The trash: what was deleted in the last 30 days, by whom and when, how long it has left, and
 * Restore. A refused restore keeps the item and says why on its row.
 */
export function TrashView({
  rows,
  meta,
  kind,
  now: nowIso,
}: {
  rows: TrashItem[];
  meta: Meta;
  kind: TrashFilter;
  now: string;
}) {
  const { t } = useTranslation();
  const router = useRouter();
  const { setParams, isPending } = useUrlParams();
  const { run, pendingKey, pending } = useAction();
  const [problems, setProblems] = useState<Record<string, string>>({});
  const now = new Date(nowIso);

  async function restore(item: TrashItem) {
    setProblems((current) => {
      const next = { ...current };
      delete next[item.id];
      return next;
    });
    const res = await callApi(RESTORE_TRASH_ITEM(item.kind, item.id), {
      showErrorToast: false,
      showSuccessToast: true,
      successMessage: t('admin.trash.restored', { label: item.label }),
    });
    if (res.success) return router.refresh();
    if (!isUnauthorized(res))
      setProblems((current) => ({
        ...current,
        [item.id]: errorMessage(t, res),
      }));
  }

  const left = (item: TrashItem) => {
    const days = daysLeft(item.purgeAt, now);
    return days === 0
      ? t('admin.trash.lastDay')
      : t('admin.trash.daysLeft', { count: formatNumber(days) });
  };

  const restoreButton = (item: TrashItem, className?: string) => (
    <Button
      variant="soft"
      size="sm"
      className={className}
      disabled={pending}
      aria-label={t('admin.trash.restoreItem', { label: item.label })}
      onClick={() => void run(item.id, () => restore(item))}
      data-testid="trash-restore"
    >
      {pendingKey === item.id ? (
        <LoaderCircle aria-hidden className="animate-spin" />
      ) : (
        <RotateCcw aria-hidden />
      )}
      {pendingKey === item.id ? t('dialog.working') : t('admin.trash.restore')}
    </Button>
  );

  const problem = (item: TrashItem) =>
    problems[item.id] ? (
      <p
        role="alert"
        className="text-xs font-semibold whitespace-normal text-destructive"
      >
        {problems[item.id]}
      </p>
    ) : null;

  const itemCell = (item: TrashItem) => {
    const Icon = KIND_ICON[item.kind];
    return (
      <span className="flex min-w-0 items-center gap-3 md:min-w-52">
        <span
          aria-hidden
          className="grid size-9 shrink-0 place-items-center rounded-pill bg-secondary text-secondary-foreground"
        >
          <Icon className="size-4" />
        </span>
        <span className="grid min-w-0 gap-0.5">
          <span className="truncate font-bold" title={item.label}>
            <bdi>{item.label}</bdi>
          </span>
          <span className="text-xs text-muted-foreground">
            {t(`admin.trash.kind${item.kind}`)}
          </span>
        </span>
      </span>
    );
  };

  const columns: DataColumn<TrashItem>[] = [
    {
      id: 'item',
      header: t('admin.trash.item'),
      className: 'w-[38%]',
      cell: (item) => (
        <span className="grid gap-1.5">
          {itemCell(item)}
          {problem(item)}
        </span>
      ),
    },
    {
      id: 'by',
      header: t('admin.trash.deletedBy'),
      className: 'hidden lg:table-cell',
      cell: (item) => item.deletedBy?.name ?? t('admin.trash.unknownUser'),
    },
    {
      id: 'at',
      header: t('admin.trash.deletedAt'),
      // The date and the time left share a column, so Restore stays in view on tablets.
      cell: (item) => (
        <span className="grid justify-items-start gap-1">
          <DateText value={item.deletedAt} />
          <TimeLeft
            label={left(item)}
            urgent={daysLeft(item.purgeAt, now) <= 3}
          />
        </span>
      ),
    },
    {
      id: 'restore',
      header: '',
      className: 'w-36 text-end',
      cell: (item) => restoreButton(item),
    },
  ];

  const kindOptions = [
    { value: 'ALL' as const, label: t('admin.trash.all') },
    { value: 'OWNER' as const, label: t('admin.trash.OWNER') },
    { value: 'LISTING' as const, label: t('admin.trash.LISTING') },
    { value: 'PHOTO' as const, label: t('admin.trash.PHOTO') },
  ];

  return (
    <div className="grid grid-cols-1 gap-5" data-testid="trash-page">
      <PageHeader title={t('nav.trash')} />
      <FilterChips
        label={t('admin.trash.kindFilter')}
        options={kindOptions}
        value={kind}
        onChange={(next) => setParams({ kind: next === 'ALL' ? null : next })}
      />
      <p className="-mt-2 max-w-prose text-sm text-muted-foreground">
        {t('admin.trash.retention')}
      </p>
      <DataList
        // One shrinkable track: a wide table scrolls inside its card instead of widening the page.
        className="grid-cols-1"
        label={t('nav.trash')}
        columns={columns}
        rows={rows}
        rowKey={(item) => `${item.kind}-${item.id}`}
        meta={meta}
        isRefetching={isPending}
        renderCard={(item) => (
          <div
            className="grid gap-3 rounded-md bg-card p-4 shadow-raised"
            data-testid="trash-card"
          >
            {itemCell(item)}
            <p className="flex flex-wrap gap-x-3 text-xs text-muted-foreground">
              <span>
                {item.deletedBy?.name ?? t('admin.trash.unknownUser')}
              </span>
              <DateText value={item.deletedAt} />
            </p>
            {problem(item)}
            <div className="flex items-center justify-between gap-3">
              <TimeLeft
                label={left(item)}
                urgent={daysLeft(item.purgeAt, now) <= 3}
              />
              {restoreButton(item)}
            </div>
          </div>
        )}
        empty={{
          icon: Trash2,
          title: t('admin.trash.emptyTitle'),
          body: t('admin.trash.emptyBody'),
        }}
      />
    </div>
  );
}

/** Days left as a chip; the last three days in amber (something is waiting on the admin). */
function TimeLeft({ label, urgent }: { label: string; urgent: boolean }) {
  return (
    <Badge
      variant={urgent ? 'urgency' : 'neutral'}
      dot="none"
      className="font-numeric"
    >
      {label}
    </Badge>
  );
}
