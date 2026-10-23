'use client';

import { RadioGroup } from 'radix-ui';
import { cn } from '@/lib/utils';

export interface RadioCardOption<T extends string> {
  value: T;
  label: string;
  hint?: string;
  /** Shown under the option while it is chosen (a picker that belongs to it). */
  children?: React.ReactNode;
}

/**
 * One-of-many choice as soft cards with a radio dot (Radix RadioGroup). `value: null` means
 * nothing is chosen yet — for choices the user must make on purpose, never pre-selected.
 */
export function RadioCards<T extends string>({
  label,
  options,
  value,
  onChange,
  disabled,
  invalid,
  describedBy,
}: {
  label: string;
  options: readonly RadioCardOption<T>[];
  value: T | null;
  onChange: (value: T) => void;
  disabled?: boolean;
  invalid?: boolean;
  describedBy?: string;
}) {
  return (
    <RadioGroup.Root
      aria-label={label}
      aria-invalid={invalid || undefined}
      aria-describedby={describedBy}
      value={value ?? ''}
      onValueChange={(next) => onChange(next as T)}
      disabled={disabled}
      className="grid gap-2"
    >
      {options.map((option) => {
        const selected = option.value === value;
        return (
          <div
            key={option.value}
            className={cn(
              'grid gap-3 rounded-md bg-card p-3 shadow-soft ring-1 transition-[box-shadow] duration-200 ease-snappy',
              selected
                ? 'ring-2 ring-primary'
                : invalid
                  ? 'ring-destructive/60'
                  : 'ring-border',
            )}
          >
            <label
              className={cn(
                'flex items-start gap-3',
                disabled ? 'cursor-not-allowed' : 'cursor-pointer',
              )}
            >
              <RadioGroup.Item
                value={option.value}
                data-testid={`choice-${option.value}`}
                className={cn(
                  'mt-0.5 grid size-5 shrink-0 place-items-center rounded-pill border border-input bg-card',
                  'outline-none focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-ring',
                  'disabled:cursor-not-allowed data-[state=checked]:border-primary',
                )}
              >
                <RadioGroup.Indicator className="size-2.5 rounded-pill bg-primary" />
              </RadioGroup.Item>
              <span className="grid min-w-0 gap-0.5">
                <span className="text-sm font-bold">{option.label}</span>
                {option.hint && (
                  <span className="text-xs text-muted-foreground">
                    {option.hint}
                  </span>
                )}
              </span>
            </label>
            {selected && option.children}
          </div>
        );
      })}
    </RadioGroup.Root>
  );
}
