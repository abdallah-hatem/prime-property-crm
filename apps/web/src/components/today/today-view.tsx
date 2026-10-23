'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { BellRing, CalendarCheck, LoaderCircle } from 'lucide-react';
import type { Meta, OwnerRow as OwnerRowData, Today } from '@prime-crm/shared';
import { GET_CALLING_LIST } from '@/apis';
import { CallButton } from '@/components/calling/call-button';
import { EmptyState } from '@/components/empty-state';
import { PageHeader } from '@/components/page-header';
import { ReminderRow } from '@/components/reminders/reminder-row';
import { StatusChip } from '@/components/status-chip';
import { Button } from '@/components/ui/button';
import { useTranslation } from '@/i18n/i18n-provider';
import { callApi } from '@/lib/callApi';
import { formatDate } from '@/lib/format';
import { ownerUrgency, ownerWhen } from '@/lib/when';
import { CounterBoard } from './counter-board';
import { MissingOutcomeCard } from './missing-outcome-card';
import { OwnerRow } from './owner-row';
import { SectionHeading } from './section-heading';

export interface CallingListPage {
  rows: OwnerRowData[];
  meta: Meta;
}

/** Rows from later pages, minus any the refreshed first page already shows. */
function mergeRows(
  first: OwnerRowData[],
  more: OwnerRowData[],
): OwnerRowData[] {
  const seen = new Set(first.map((row) => row.id));
  return [
    ...first,
    ...more.filter((row) => !seen.has(row.id) && seen.add(row.id)),
  ];
}

/**
 * Today: the counter board, then what is waiting on the member (calls without an outcome,
 * overdue and due-today reminders, ad tasks), then the calling list with "show more".
 */
export function TodayView({
  today,
  callingList,
  now: nowIso,
}: {
  today: Today;
  callingList: CallingListPage;
  now: string;
}) {
  const { t, locale } = useTranslation();
  const now = useMemo(() => new Date(nowIso), [nowIso]);
  const [more, setMore] = useState<{ rows: OwnerRowData[]; meta: Meta } | null>(
    null,
  );
  const [loadingMore, setLoadingMore] = useState(false);

  const meta =
    more && more.meta.page > callingList.meta.page
      ? more.meta
      : callingList.meta;
  const rows = more ? mergeRows(callingList.rows, more.rows) : callingList.rows;

  async function loadMore() {
    if (loadingMore) return;
    setLoadingMore(true);
    try {
      const res = await callApi(GET_CALLING_LIST(meta.page + 1));
      if (res.success && res.meta)
        setMore((prev) => ({
          rows: [...(prev?.rows ?? []), ...res.data],
          meta: res.meta!,
        }));
    } catch {
      // Offline: the button frees up for another try.
    } finally {
      setLoadingMore(false);
    }
  }

  const { outcomeMissing, overdue, dueToday, adTasks, counts } = today;
  // Counters and headings show the API's totals; each list holds at most TODAY_LIST_MAX rows.
  const nothingWaiting =
    counts.outcomeMissing +
      counts.overdue +
      counts.dueToday +
      counts.adTasks ===
    0;

  return (
    <div className="grid gap-6">
      <div className="-mx-4 -mt-2 grid gap-4 bg-today-glow px-4 pt-2 md:-mx-8 md:-mt-8 md:px-8 md:pt-8">
        <PageHeader
          title={t('today.title')}
          description={formatDate(now, locale, 'weekday')}
          actions={
            <Button asChild variant="soft" size="sm" className="h-11">
              <Link href="/reminders">
                <BellRing aria-hidden />
                {t('today.allReminders')}
              </Link>
            </Button>
          }
        />
        <CounterBoard
          counters={[
            {
              tone: 'overdue',
              value: counts.overdue,
              label: t('today.overdue'),
            },
            {
              tone: 'due',
              value: counts.dueToday,
              label: t('today.dueToday'),
            },
            {
              tone: 'missing',
              value: counts.outcomeMissing,
              label: t('today.noOutcome'),
            },
          ]}
        />
      </div>

      {nothingWaiting && rows.length === 0 && (
        <EmptyState
          icon={CalendarCheck}
          title={t('today.emptyTitle')}
          body={t('today.emptyBody')}
        />
      )}

      {outcomeMissing.length > 0 && (
        <section aria-labelledby="today-missing" className="grid gap-2.5">
          <SectionHeading
            id="today-missing"
            title={t('today.needsOutcome')}
            count={counts.outcomeMissing}
          />
          {outcomeMissing.map((call) => (
            <MissingOutcomeCard key={call.id} call={call} now={now} />
          ))}
        </section>
      )}

      {[
        {
          id: 'today-overdue',
          title: t('today.overdue'),
          items: overdue,
          total: counts.overdue,
        },
        {
          id: 'today-due',
          title: t('today.dueToday'),
          items: dueToday,
          total: counts.dueToday,
        },
        {
          id: 'today-ads',
          title: t('today.adTasks'),
          items: adTasks,
          total: counts.adTasks,
        },
      ].map(
        (section) =>
          section.items.length > 0 && (
            <section
              key={section.id}
              aria-labelledby={section.id}
              className="grid gap-2.5"
            >
              <SectionHeading
                id={section.id}
                title={section.title}
                count={section.total}
              />
              <ul className="grid gap-2.5">
                {section.items.map((reminder) => (
                  <li key={reminder.id}>
                    <ReminderRow
                      reminder={reminder}
                      now={now}
                      action={
                        reminder.kind === 'MANUAL' && reminder.owner ? (
                          <CallButton target={reminder.owner} />
                        ) : undefined
                      }
                    />
                  </li>
                ))}
              </ul>
            </section>
          ),
      )}

      {rows.length > 0 && (
        <section aria-labelledby="today-calling" className="grid gap-2.5">
          <SectionHeading
            id="today-calling"
            title={t('today.callingList')}
            count={meta.total}
          />
          <ul className="grid gap-2.5" data-testid="calling-list">
            {rows.map((owner) => (
              <li key={owner.id}>
                <OwnerRow
                  urgency={ownerUrgency(owner, now)}
                  name={owner.name}
                  href={`/owners/${owner.id}`}
                  detail={owner.area ?? t('owners.noArea')}
                  status={<StatusChip kind="lead" status={owner.status} />}
                  when={ownerWhen(t, locale, owner, now)}
                  action={<CallButton target={owner} />}
                />
              </li>
            ))}
          </ul>
          {meta.hasNextPage && (
            <Button
              variant="secondary"
              className="justify-self-center"
              disabled={loadingMore}
              aria-busy={loadingMore || undefined}
              onClick={() => void loadMore()}
            >
              {loadingMore && (
                <LoaderCircle aria-hidden className="animate-spin" />
              )}
              {loadingMore ? t('today.loadingMore') : t('today.loadMore')}
            </Button>
          )}
        </section>
      )}
    </div>
  );
}
