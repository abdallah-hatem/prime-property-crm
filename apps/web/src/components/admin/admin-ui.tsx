'use client';

import { useCallback, useRef, useState } from 'react';
import { Info } from 'lucide-react';
import { Select as SelectRoot } from '@/components/ui/select';
import { useTranslation } from '@/i18n/i18n-provider';
import { cn } from '@/lib/utils';

/**
 * Small pieces the admin screens share: a form-level error, a "why this is disabled" note, a
 * titled panel, and a one-request-at-a-time runner for buttons.
 */

/** An error about the whole form (not one field), announced to screen readers. */
export function FormAlert({ message }: { message?: string | null }) {
  if (!message) return null;
  return (
    <p
      role="alert"
      className="rounded-md bg-destructive-soft px-4 py-3 text-sm font-semibold text-destructive"
    >
      {message}
    </p>
  );
}

/** Why an action is unavailable, next to the disabled control (linked with `id`). */
export function DisabledReason({
  id,
  children,
  className,
}: {
  id?: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <p
      id={id}
      className={cn(
        'flex items-start gap-2 text-xs text-muted-foreground',
        className,
      )}
    >
      <Info aria-hidden className="mt-px size-3.5 shrink-0" />
      <span>{children}</span>
    </p>
  );
}

/** A titled card on a settings-like page. */
export function Panel({
  title,
  description,
  actions,
  children,
  className,
  testId,
}: {
  title: string;
  description?: string;
  actions?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
  testId?: string;
}) {
  return (
    <section
      data-testid={testId}
      aria-label={title}
      className={cn(
        'grid min-w-0 gap-5 rounded-lg bg-card p-5 shadow-raised md:p-6',
        className,
      )}
    >
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div className="grid max-w-prose min-w-0 gap-1">
          <h2 className="type-h2">{title}</h2>
          {description && (
            <p className="text-sm text-muted-foreground">{description}</p>
          )}
        </div>
        {actions}
      </header>
      {children}
    </section>
  );
}

/**
 * Runs one request at a time: `run` is ignored while one is in flight, and `pendingKey` says
 * which control started it (so only that one shows a spinner while its siblings lock).
 */
export function useAction() {
  const [pendingKey, setPendingKey] = useState<string | null>(null);
  const busy = useRef(false);
  const run = useCallback(
    async <R,>(key: string, task: () => Promise<R>): Promise<R | undefined> => {
      if (busy.current) return undefined;
      busy.current = true;
      setPendingKey(key);
      try {
        return await task();
      } finally {
        busy.current = false;
        setPendingKey(null);
      }
    },
    [],
  );
  return { run, pendingKey, pending: pendingKey !== null };
}

/**
 * The shared Select with the reading direction set: Radix Select sets `dir` on itself (ltr
 * unless told), which leaves the value and chevron un-mirrored in Arabic.
 */
export function Select(props: React.ComponentProps<typeof SelectRoot>) {
  const { locale } = useTranslation();
  return <SelectRoot dir={locale === 'ar' ? 'rtl' : 'ltr'} {...props} />;
}
