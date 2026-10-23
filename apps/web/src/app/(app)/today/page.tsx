import { GET_CALLING_LIST, GET_TODAY } from '@/apis';
import { LoadError } from '@/components/load-error';
import { TodayView } from '@/components/today/today-view';
import { getTranslator } from '@/i18n/server';

/** Today: what is waiting on the member, then their calling list. Rendered with the data. */
export default async function TodayPage() {
  const [today, list] = await Promise.all([GET_TODAY(), GET_CALLING_LIST(1)]);
  if (!today.success || !list.success || !list.meta) {
    const t = await getTranslator();
    return (
      <LoadError title={t('today.title')} message={t('today.loadError')} />
    );
  }
  return (
    <TodayView
      today={today.data}
      callingList={{ rows: list.data, meta: list.meta }}
      now={new Date().toISOString()}
    />
  );
}
