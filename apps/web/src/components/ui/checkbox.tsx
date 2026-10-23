'use client';

import { Check, Minus } from 'lucide-react';
import { Checkbox as CheckboxPrimitive } from 'radix-ui';
import { cn } from '@/lib/utils';

/** The 20px box both checkboxes draw; it fills with the primary colour when ticked. */
const box = cn(
  'grid size-5 shrink-0 place-items-center rounded-[6px] border-2 border-input bg-card',
  'transition-[background-color,border-color] duration-150 ease-snappy',
);

/**
 * A styled checkbox (Radix) with a 44px tap area around a 20px box, for a control that stands on
 * its own (a row's selection, "select this page"); `indeterminate` shows a dash. Clicks don't
 * reach a clickable row behind it.
 */
export function Checkbox({
  checked,
  indeterminate = false,
  onCheckedChange,
  label,
  disabled,
  className,
}: {
  checked: boolean;
  indeterminate?: boolean;
  onCheckedChange: (checked: boolean) => void;
  /** Accessible name (translated). */
  label: string;
  disabled?: boolean;
  className?: string;
}) {
  const state = indeterminate && !checked ? 'indeterminate' : checked;
  return (
    <CheckboxPrimitive.Root
      checked={state}
      disabled={disabled}
      aria-label={label}
      onCheckedChange={(next) => onCheckedChange(next === true)}
      onClick={(event) => event.stopPropagation()}
      className={cn(
        'group grid size-11 shrink-0 cursor-pointer place-items-center rounded-pill outline-none',
        'focus-visible:outline-3 focus-visible:outline-offset-[-6px] focus-visible:outline-ring',
        'disabled:cursor-not-allowed disabled:opacity-50',
        className,
      )}
    >
      <span
        aria-hidden
        className={cn(
          box,
          'group-data-[state=checked]:border-primary group-data-[state=checked]:bg-primary',
          'group-data-[state=indeterminate]:border-primary group-data-[state=indeterminate]:bg-primary',
        )}
      >
        <CheckboxPrimitive.Indicator className="text-primary-foreground">
          {state === 'indeterminate' ? (
            <Minus className="size-3.5" strokeWidth={3} />
          ) : (
            <Check className="size-3.5" strokeWidth={3} />
          )}
        </CheckboxPrimitive.Indicator>
      </span>
    </CheckboxPrimitive.Root>
  );
}

/**
 * A checkbox with its label and an optional line under it (a permission, an option); the whole
 * row is the hit target, 44px tall at least.
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
          box,
          'mt-0.5 shadow-soft outline-none focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-ring',
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
