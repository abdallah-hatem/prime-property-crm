import { Construction } from 'lucide-react';
import { EmptyState } from '@/components/empty-state';
import { PageHeader } from '@/components/page-header';
import { getTranslator } from '@/i18n/server';
import type { MessageKey } from '@/i18n/translate';

/** A page whose screen isn't built yet: its title and a "coming soon" empty state. */
export async function ComingSoon({ titleKey }: { titleKey: MessageKey }) {
  const t = await getTranslator();
  return (
    <div className="grid gap-6">
      <PageHeader title={t(titleKey)} />
      <EmptyState
        icon={Construction}
        title={t('comingSoon.title')}
        body={t('comingSoon.body')}
      />
    </div>
  );
}
