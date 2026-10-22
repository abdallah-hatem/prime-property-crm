'use client';

import { useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { CloudOff, LoaderCircle, RotateCw } from 'lucide-react';
import { EmptyState } from '@/components/empty-state';
import { Button } from '@/components/ui/button';
import { useTranslation } from '@/i18n/i18n-provider';

/** Signed in, but the API can't be reached: say so and offer a retry, never a blank screen. */
export function ServerUnavailable() {
  const { t } = useTranslation();
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  return (
    <main className="mx-auto grid min-h-dvh max-w-md place-items-center px-4">
      <EmptyState
        tone="error"
        icon={CloudOff}
        title={t('shell.unavailableTitle')}
        body={t('shell.unavailableBody')}
        action={
          <Button
            variant="soft"
            disabled={pending}
            onClick={() => startTransition(() => router.refresh())}
          >
            {pending ? (
              <LoaderCircle aria-hidden className="animate-spin" />
            ) : (
              <RotateCw aria-hidden />
            )}
            {t('action.retry')}
          </Button>
        }
      />
    </main>
  );
}
