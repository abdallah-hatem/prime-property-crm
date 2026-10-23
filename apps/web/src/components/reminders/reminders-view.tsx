'use client';

import { useMemo } from 'react';
import Link from 'next/link';
import { BellRing } from 'lucide-react';
import type { Meta, Reminder } from '@prime-crm/shared';
import { DataList, type DataColumn } from '@/components/data-list';
import { FilterChips } from '@/components/filter-chips';
import { PageHeader } from '@/components/page-header';
import { OwnerRowSkeleton } from '@/components/today/owner-row';
import { useTranslation } from '@/i18n/i18n-provider';
import { formatDate } from '@/lib/format';
import { REMINDER_FILTERS, type ReminderFilter } from '@/lib/reminder-filters';
import { useUrlParams } from '@/lib/use-url-params';
import { cn } from '@/lib/utils';
import { dueText, reminderUrgency } from '@/lib/when';
import { ReminderActions } from './reminder-actions';
import { reminderHref, ReminderRow } from './reminder-row';

/** The member's own reminders, filtered by when they're due, with Done and Edit. */
export function RemindersView({
  rows,
  meta,
  filter,
  now: nowIso,
}: {
  rows: Reminder[];
  meta: Meta;
  filter: ReminderFilter;
  now: string;
}) {
  const { t, locale } = useTranslation();
  const { setParams, isPending } = useUrlParams();
  const now = useMemo(() => new Date(nowIso), [nowIso]);

  const nameOf = (r: Reminder) =>
    r.kind === 'AD_CHECK_IN'
      ? t('today.adCheckIn', { title: r.listing?.title ?? '' })
      : r.kind === 'AD_TAKE_DOWN'
        ? t('today.adTakeDown', { title: r.listing?.title ?? '' })
        : (r.owner?.name ?? r.listing?.title ?? '');

  const columns: DataColumn<Reminder>[] = [
    {
      id: 'who',
      header: t('owners.name'),
      className: 'w-[28%]',
      cell: (r) => {
        const href = reminderHref(r);
        return href ? (
          <Link
            href={href}
            title={nameOf(r)}
            className="block truncate font-bold hover:text-primary"
          >
            {nameOf(r)}
          </Link>
        ) : (
          nameOf(r)
        );
      },
    },
    {
      id: 'note',
      header: t('reminders.note'),
      cell: (r) =>
        r.note ?? (
          <span className="text-muted-foreground">{t('reminders.noNote')}</span>
        ),
    },
    {
      id: 'when',
      header: t('reminders.due'),
      cell: (r) => (
        <span
          className={cn(
            'font-semibold',
            reminderUrgency(r, now) === 'overdue' && 'text-destructive',
          )}
        >
          {r.doneAt
            ? t('reminders.doneOn', {
                date: formatDate(r.doneAt, locale, 'dateTime'),
              })
            : dueText(t, locale, r.dueAt, now)}
        </span>
      ),
    },
    {
      id: 'actions',
      header: '',
      className: 'w-56 text-end',
      cell: (r) => (
        <div className="flex justify-end">
          <ReminderActions reminder={r} layout="inline" />
        </div>
      ),
    },
  ];

  const options = REMINDER_FILTERS.map((value) => ({
    value,
    label: t(`reminders.${value}`),
  }));

  return (
    <div className="grid gap-5">
      <PageHeader title={t('reminders.title')} />
      <FilterChips
        label={t('reminders.whenLabel')}
        options={options}
        value={filter}
        onChange={(next) => setParams({ when: next === 'open' ? null : next })}
      />
      <DataList
        label={t('reminders.title')}
        columns={columns}
        rows={rows}
        rowKey={(r) => r.id}
        meta={meta}
        isRefetching={isPending}
        renderCard={(r) => (
          <ReminderRow
            reminder={r}
            now={now}
            action={<ReminderActions reminder={r} />}
          />
        )}
        renderCardSkeleton={() => <OwnerRowSkeleton />}
        empty={{
          icon: BellRing,
          title: t('reminders.emptyTitle'),
          body: t('reminders.emptyBody'),
        }}
      />
    </div>
  );
}
