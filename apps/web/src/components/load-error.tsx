'use client';

import { useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { CloudOff, LoaderCircle } from 'lucide-react';
import { EmptyState } from '@/components/empty-state';
import { PageHeader } from '@/components/page-header';
import { Button } from '@/components/ui/button';
import { useTranslation } from '@/i18n/i18n-provider';

/** A screen whose data didn't load: its title, what failed, and a retry that re-renders it. */
export function LoadError({
  title,
  message,
}: {
  title: string;
  message: string;
}) {
  const { t } = useTranslation();
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  return (
    <div className="grid gap-6">
      <PageHeader title={title} />
      <EmptyState
        tone="error"
        icon={CloudOff}
        title={message}
        body={t('error.network')}
        action={
          <Button
            variant="secondary"
            disabled={pending}
            onClick={() => startTransition(() => router.refresh())}
          >
            {pending && <LoaderCircle aria-hidden className="animate-spin" />}
            {t('action.retry')}
          </Button>
        }
      />
    </div>
  );
}
