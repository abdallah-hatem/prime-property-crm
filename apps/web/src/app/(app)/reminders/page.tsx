import { GET_REMINDERS } from '@/apis';
import { LoadError } from '@/components/load-error';
import { RemindersView } from '@/components/reminders/reminders-view';
import { getTranslator } from '@/i18n/server';
import { isReminderFilter, type ReminderFilter } from '@/lib/reminder-filters';

const one = (value: string | string[] | undefined): string | undefined =>
  Array.isArray(value) ? value[0] : value;

/** The signed-in member's reminders; `when` and `page` live in the URL. */
export default async function RemindersPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const raw = one(params.when);
  const filter: ReminderFilter = isReminderFilter(raw) ? raw : 'open';
  const pageNumber = Number(one(params.page) ?? 1);
  const page = Number.isInteger(pageNumber) && pageNumber > 0 ? pageNumber : 1;

  const res = await GET_REMINDERS({
    state: filter === 'done' ? 'done' : 'open',
    when:
      filter === 'overdue' || filter === 'today' || filter === 'upcoming'
        ? filter
        : undefined,
    page,
  });
  if (!res.success || !res.meta) {
    const t = await getTranslator();
    return (
      <LoadError title={t('reminders.title')} message={t('error.generic')} />
    );
  }
  return (
    <RemindersView
      rows={res.data}
      meta={res.meta}
      filter={filter}
      now={new Date().toISOString()}
    />
  );
}
