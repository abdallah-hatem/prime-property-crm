'use client';

import { Check } from 'lucide-react';
import { Checkbox as CheckboxPrimitive } from 'radix-ui';
import { cn } from '@/lib/utils';

/**
 * A permission tick-box with its label and an optional line under it. Radix Checkbox, so it is
 * keyboard- and screen-reader-correct; the whole row is the hit target (44px tall at least).
 * Candidate for `components/ui/` (see the T16 report).
 */
export function CheckboxRow({
  checked,
  onCheckedChange,
  label,
  hint,
  disabled,
  testId,
}: {
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
  label: string;
  hint?: string;
  disabled?: boolean;
  testId?: string;
}) {
  return (
    <label
      className={cn(
        'flex min-h-11 items-start gap-3 rounded-sm px-3 py-2.5 transition-colors duration-150',
        disabled ? 'cursor-not-allowed' : 'cursor-pointer hover:bg-accent/60',
      )}
    >
      <CheckboxPrimitive.Root
        checked={checked}
        disabled={disabled}
        onCheckedChange={(value) => onCheckedChange(value === true)}
        data-testid={testId}
        className={cn(
          'mt-0.5 grid size-5 shrink-0 place-items-center rounded-[6px] border border-input bg-card shadow-soft',
          'transition-[background-color,border-color] duration-150 ease-snappy',
          'outline-none focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-ring',
          'data-[state=checked]:border-primary data-[state=checked]:bg-primary data-[state=checked]:text-primary-foreground',
          'disabled:cursor-not-allowed disabled:opacity-60',
        )}
      >
        <CheckboxPrimitive.Indicator>
          <Check aria-hidden className="size-3.5" strokeWidth={3} />
        </CheckboxPrimitive.Indicator>
      </CheckboxPrimitive.Root>
      <span className="grid min-w-0 gap-0.5">
        <span className={cn('text-sm font-semibold', disabled && 'opacity-80')}>
          {label}
        </span>
        {hint && <span className="text-xs text-muted-foreground">{hint}</span>}
      </span>
    </label>
  );
}
