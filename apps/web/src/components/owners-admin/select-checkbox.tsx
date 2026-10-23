'use client';

import { Check, Minus } from 'lucide-react';
import { Checkbox as CheckboxPrimitive } from 'radix-ui';
import { cn } from '@/lib/utils';

/**
 * A styled checkbox (Radix) with a 44px tap area around a 20px box; `indeterminate` shows a dash
 * (part of the page selected). Candidate for `components/ui/checkbox.tsx`.
 */
export function SelectCheckbox({
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
          'grid size-5 place-items-center rounded-[6px] border-2 border-input bg-card',
          'transition-[background-color,border-color] duration-150 ease-snappy',
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
