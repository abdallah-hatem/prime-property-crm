import { GET_ALL_CALL_OUTCOMES, GET_SETTINGS } from '@/apis';
import { CheckInInterval } from '@/components/admin/settings/check-in-interval';
import { OutcomesManager } from '@/components/admin/settings/outcomes-manager';
import { LoadError } from '@/components/load-error';
import { PageHeader } from '@/components/page-header';
import { getTranslator } from '@/i18n/server';

/** Settings (settings.manage): the ad check-in interval and the call outcomes. */
export default async function SettingsPage() {
  const [settings, outcomes] = await Promise.all([
    GET_SETTINGS(),
    GET_ALL_CALL_OUTCOMES(),
  ]);
  const t = await getTranslator();
  if (!settings.success || !outcomes.success)
    return <LoadError title={t('nav.settings')} message={t('error.generic')} />;
  return (
    <div className="grid grid-cols-1 gap-5" data-testid="settings-page">
      <PageHeader title={t('nav.settings')} />
      <div className="grid items-start gap-5 xl:grid-cols-[minmax(0,1fr)_minmax(0,1.6fr)]">
        <CheckInInterval days={settings.data.adCheckInDays} />
        <OutcomesManager outcomes={outcomes.data} />
      </div>
    </div>
  );
}
