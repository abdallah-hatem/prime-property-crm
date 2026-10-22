'use client';

import { useTranslation } from '@/i18n/i18n-provider';
import { formatDate, type DateStyle } from '@/lib/format';
import { cn } from '@/lib/utils';

/**
 * A date or time on Cairo time, in the reader's language. Server and browser format with the same
 * fixed time zone, so the first paint and hydration agree.
 */
export function DateText({
  value,
  style = 'date',
  className,
}: {
  value: Date | string;
  style?: DateStyle;
  className?: string;
}) {
  const { locale } = useTranslation();
  const date = typeof value === 'string' ? new Date(value) : value;
  if (Number.isNaN(date.getTime())) return null;
  return (
    <time
      dateTime={date.toISOString()}
      className={cn('whitespace-nowrap', className)}
    >
      {formatDate(date, locale, style)}
    </time>
  );
}
