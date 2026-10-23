'use client';

import { useState } from 'react';
import { Input } from '@/components/ui/input';
import { formatNumber } from '@/lib/format';
import { cn } from '@/lib/utils';

type NumberInputProps = Omit<
  React.ComponentProps<typeof Input>,
  'type' | 'value' | 'onChange' | 'inputMode'
> & {
  /** The number the form holds; `null` when empty. */
  value: number | null;
  onChange: (value: number | null) => void;
  /** Allow a leading minus (floors). */
  allowNegative?: boolean;
};

const display = (value: number | null) =>
  value === null ? '' : formatNumber(value);

/**
 * A whole-number field: the form holds a number, the field shows it grouped (`8,500,000`) when
 * not focused and raw while typing, so the caret never jumps. No spinner, no wheel changes, Latin
 * digits in both languages. Anything but digits (and a leading minus when allowed) is refused.
 */
export function NumberInput({
  value,
  onChange,
  allowNegative = false,
  className,
  onFocus,
  onBlur,
  ...props
}: NumberInputProps) {
  const [draft, setDraft] = useState<string | null>(null);
  const pattern = allowNegative ? /^-?\d*$/ : /^\d*$/;

  return (
    <Input
      {...props}
      type="text"
      inputMode="numeric"
      dir="ltr"
      className={cn('font-numeric tabular-nums rtl:text-end', className)}
      value={draft ?? display(value)}
      onFocus={(event) => {
        setDraft(value === null ? '' : String(value));
        onFocus?.(event);
      }}
      onBlur={(event) => {
        setDraft(null);
        onBlur?.(event);
      }}
      onChange={(event) => {
        const raw = event.target.value.replace(/[,\s٬]/g, '');
        if (!pattern.test(raw)) return;
        setDraft(raw);
        onChange(raw === '' || raw === '-' ? null : Number(raw));
      }}
    />
  );
}
