'use client';

import * as React from 'react';
import { useTranslation } from '@/i18n/i18n-provider';
import { formatNumber } from '@/lib/format';
import { cn } from '@/lib/utils';

/**
 * Prose fields (notes, reasons, descriptions): four rows to start, grows with its text; 16px on
 * phones. `showCount` with a `maxLength` adds the visible character counter under it.
 */
function Textarea({
  className,
  rows = 4,
  showCount = false,
  ...props
}: React.ComponentProps<'textarea'> & { showCount?: boolean }) {
  const field = (
    <textarea
      data-slot="textarea"
      rows={rows}
      className={cn(
        'field-sizing-content min-h-24 w-full min-w-0 rounded-sm border border-input bg-card px-4 py-3 text-base text-foreground shadow-soft md:text-sm',
        'scrollbar-clean max-h-60 resize-none overflow-y-auto',
        'transition-[border-color,box-shadow] duration-200 ease-snappy',
        'selection:bg-primary selection:text-primary-foreground placeholder:text-placeholder',
        'outline-none focus-visible:border-ring focus-visible:ring-4 focus-visible:ring-ring/20',
        'disabled:cursor-not-allowed disabled:opacity-50',
        'aria-invalid:border-destructive aria-invalid:ring-4 aria-invalid:ring-destructive/15',
        className,
      )}
      {...props}
    />
  );
  if (!showCount || props.maxLength === undefined) return field;
  return (
    <div className="grid gap-1">
      {field}
      <CharacterCount
        count={String(props.value ?? '').length}
        max={props.maxLength}
      />
    </div>
  );
}

/** "120 / 2,000" under a field with a limit; Latin digits, never mirrored. */
function CharacterCount({ count, max }: { count: number; max: number }) {
  const { t } = useTranslation();
  return (
    <span
      aria-hidden
      dir="ltr"
      className="justify-self-end font-numeric text-xs text-muted-foreground tabular-nums"
    >
      {t('form.counter', {
        count: formatNumber(count),
        max: formatNumber(max),
      })}
    </span>
  );
}

export { Textarea };
