'use client';

import { Check } from 'lucide-react';
import { cn } from '@/lib/utils';

export interface Choice<T extends string> {
  value: T;
  label: string;
}

type ChoiceChipsProps<T extends string> = {
  /** Accessible name of the group. */
  label: string;
  options: readonly Choice<T>[];
  disabled?: boolean;
  className?: string;
  /** Wired by FormField (id goes on the group so the label points at it). */
  id?: string;
  'aria-invalid'?: true;
  'aria-describedby'?: string;
} & (
  | { multiple: true; value: readonly T[]; onChange: (value: T[]) => void }
  | { multiple?: false; value: T | null; onChange: (value: T) => void }
);

/**
 * Pill toggles that wrap: one choice (purpose, furnishing, a minimum) or several (property
 * types). Each is a 44px button with `aria-pressed`, so they read as toggles and never look native.
 */
export function ChoiceChips<T extends string>(props: ChoiceChipsProps<T>) {
  const { label, options, disabled, className, id } = props;
  const isOn = (value: T) =>
    props.multiple ? props.value.includes(value) : props.value === value;

  function toggle(value: T) {
    if (props.multiple) {
      const next = props.value.includes(value)
        ? props.value.filter((v) => v !== value)
        : [...props.value, value];
      props.onChange(next);
    } else props.onChange(value);
  }

  return (
    <div
      id={id}
      role="group"
      aria-label={label}
      aria-describedby={props['aria-describedby']}
      className={cn('flex flex-wrap gap-2', className)}
    >
      {options.map((option) => {
        const on = isOn(option.value);
        return (
          <button
            key={option.value}
            type="button"
            aria-pressed={on}
            disabled={disabled}
            onClick={() => toggle(option.value)}
            className={cn(
              'inline-flex h-11 cursor-pointer items-center gap-1.5 rounded-pill px-4 text-sm font-semibold whitespace-nowrap',
              'transition-[background-color,color,box-shadow] duration-200 ease-snappy',
              'outline-none focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-ring',
              'disabled:cursor-not-allowed disabled:opacity-50',
              on
                ? 'bg-primary text-primary-foreground shadow-glow'
                : 'bg-card text-foreground shadow-soft hover:bg-accent hover:text-accent-foreground',
            )}
          >
            {on && props.multiple && <Check aria-hidden className="size-4" />}
            {option.label}
          </button>
        );
      })}
    </div>
  );
}
