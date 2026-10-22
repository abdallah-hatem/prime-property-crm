'use client';

import { cn } from '@/lib/utils';

export interface SegmentedOption<T extends string> {
  value: T;
  label: string;
  icon?: React.ReactNode;
}

interface SegmentedControlProps<T extends string> {
  label: string;
  options: readonly SegmentedOption<T>[];
  /** undefined while the value is unknown (e.g. theme before hydration): nothing is pressed. */
  value: T | undefined;
  onChange: (value: T) => void;
  disabled?: boolean;
  className?: string;
}

/** A pill group of mutually exclusive toggle buttons (theme, language, filters). */
export function SegmentedControl<T extends string>({
  label,
  options,
  value,
  onChange,
  disabled,
  className,
}: SegmentedControlProps<T>) {
  return (
    <div
      role="group"
      aria-label={label}
      className={cn(
        'inline-flex items-center gap-1 rounded-pill border border-border bg-card p-1 shadow-soft',
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
            onClick={() => onChange(option.value)}
            className={cn(
              'inline-flex h-9 min-w-11 items-center justify-center gap-1.5 rounded-pill px-3 type-label whitespace-nowrap text-muted-foreground',
              'transition-[background-color,color,box-shadow] duration-200 ease-snappy',
              'hover:text-foreground disabled:cursor-not-allowed disabled:opacity-50',
              'focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-ring',
              selected &&
                'bg-primary text-primary-foreground shadow-glow hover:text-primary-foreground',
            )}
          >
            {option.icon}
            <span>{option.label}</span>
          </button>
        );
      })}
    </div>
  );
}
