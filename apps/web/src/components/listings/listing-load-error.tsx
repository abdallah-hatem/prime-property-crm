'use client';

import { useRouter } from 'next/navigation';
import { CircleAlert } from 'lucide-react';
import { EmptyState } from '@/components/empty-state';
import { Button } from '@/components/ui/button';
import { useTranslation } from '@/i18n/i18n-provider';

/** A listing screen whose data didn't load: say so, and offer to try again. */
export function ListingLoadError({ message }: { message?: string }) {
  const { t } = useTranslation();
  const router = useRouter();
  return (
    <EmptyState
      tone="error"
      icon={CircleAlert}
      title={message ?? t('error.generic')}
      action={
        <Button variant="soft" onClick={() => router.refresh()}>
          {t('action.retry')}
        </Button>
      }
    />
  );
}
