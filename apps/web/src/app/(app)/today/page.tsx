import { CalendarCheck } from 'lucide-react';
import { EmptyState } from '@/components/empty-state';
import { PageHeader } from '@/components/page-header';
import { CounterBoard, type Counter } from '@/components/today/counter-board';
import { getLocale, getTranslator } from '@/i18n/server';
import { formatDate } from '@/lib/format';

/** Placeholder Today (T13 fills it): the counter board with nothing due, and the empty state. */
export default async function TodayPage() {
  const [t, locale] = await Promise.all([getTranslator(), getLocale()]);
  const counters: Counter[] = [
    { tone: 'overdue', value: 0, label: t('today.overdue') },
    { tone: 'due', value: 0, label: t('today.dueToday') },
    { tone: 'missing', value: 0, label: t('today.noOutcome') },
  ];

  return (
    <div className="grid gap-6">
      <PageHeader
        title={t('today.title')}
        description={formatDate(new Date(), locale, 'weekday')}
      />
      <CounterBoard counters={counters} />
      <EmptyState
        icon={CalendarCheck}
        title={t('today.emptyTitle')}
        body={t('today.emptyBody')}
      />
    </div>
  );
}
