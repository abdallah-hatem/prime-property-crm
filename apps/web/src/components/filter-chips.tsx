'use client';

import { cn } from '@/lib/utils';

export interface FilterChipOption<T extends string> {
  value: T;
  label: string;
}

/**
 * One-of-many filter as a row of pills that scrolls sideways on phones (statuses, "when").
 * The row keeps its height whatever is picked, so the list under it never jumps. `trailing` goes
 * after the pills in the same row (a "Custom" pill that opens a picker).
 */
export function FilterChips<T extends string>({
  label,
  options,
  value,
  onChange,
  disabled,
  trailing,
  className,
}: {
  label: string;
  options: readonly FilterChipOption<T>[];
  value: T;
  onChange: (value: T) => void;
  disabled?: boolean;
  trailing?: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      role="group"
      aria-label={label}
      className={cn(
        '-mx-4 flex scrollbar-clean gap-2 overflow-x-auto px-4 pb-1 md:mx-0 md:flex-wrap md:overflow-visible md:px-0',
        className,
      )}
    >
      {options.map((option) => {
        const selected = option.value === value;
        return (
          <button
            key={option.value}
            type="button"
            aria-pressed={selected}
            disabled={disabled}
            onClick={() => !selected && onChange(option.value)}
            className={cn(
              'h-11 shrink-0 cursor-pointer rounded-pill px-4 type-label whitespace-nowrap',
              'transition-[background-color,color,box-shadow] duration-200 ease-snappy',
              'focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-ring',
              'disabled:cursor-not-allowed',
              selected
                ? 'bg-primary text-primary-foreground shadow-glow'
                : 'bg-card text-muted-foreground shadow-soft hover:text-foreground',
            )}
          >
            {option.label}
          </button>
        );
      })}
      {trailing}
    </div>
  );
}
