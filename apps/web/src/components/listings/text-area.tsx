'use client';

import { useTranslation } from '@/i18n/i18n-provider';
import { formatNumber } from '@/lib/format';
import { cn } from '@/lib/utils';

/**
 * A prose field (description, notes) styled like `Input`: 16px on phones, soft field border,
 * the visible character counter under it when it has a limit.
 */
export function TextArea({
  className,
  value,
  maxLength,
  rows = 4,
  ...props
}: React.ComponentProps<'textarea'> & { value: string }) {
  const { t } = useTranslation();
  return (
    <div className="grid gap-1">
      <textarea
        {...props}
        rows={rows}
        value={value}
        maxLength={maxLength}
        className={cn(
          'scrollbar-clean w-full min-w-0 resize-y rounded-sm border border-input bg-card px-4 py-3 text-base text-foreground shadow-soft md:text-sm',
          'transition-[border-color,box-shadow] duration-200 ease-snappy placeholder:text-muted-foreground',
          'outline-none focus-visible:border-ring focus-visible:ring-4 focus-visible:ring-ring/20',
          'disabled:cursor-not-allowed disabled:opacity-50',
          'aria-invalid:border-destructive aria-invalid:ring-4 aria-invalid:ring-destructive/15',
          className,
        )}
      />
      {maxLength !== undefined && (
        <span
          aria-hidden
          dir="ltr"
          className="justify-self-end font-numeric text-xs text-muted-foreground tabular-nums"
        >
          {t('listings.form.counter', {
            count: formatNumber(value.length),
            max: formatNumber(maxLength),
          })}
        </span>
      )}
    </div>
  );
}
