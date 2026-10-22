import { MorePanel } from '@/components/shell/more-panel';
import { PageHeader } from '@/components/page-header';
import { getTranslator } from '@/i18n/server';

/** Phones: the admin pages this person may open, and their account. */
export default async function MorePage() {
  const t = await getTranslator();
  return (
    <div className="grid gap-6">
      <PageHeader title={t('nav.more')} />
      <MorePanel />
    </div>
  );
}
