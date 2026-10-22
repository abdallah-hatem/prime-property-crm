'use client';

import { useId } from 'react';
import { Label } from '@/components/ui/label';
import { cn } from '@/lib/utils';

/** Props the field hands to its control, so label, hint and error are wired for screen readers. */
export interface FieldControlProps {
  id: string;
  required?: boolean;
  'aria-invalid'?: true;
  'aria-describedby'?: string;
}

/**
 * Label (with an aria-hidden asterisk when required) + the control + a hint + the error, wired
 * together. The control is a render prop so any input works:
 *
 * <FormField label={t('x')} required error={errors.email?.message}>
 *   {(field) => <Input {...field} {...register('email')} placeholder={t('xPlaceholder')} />}
 * </FormField>
 */
export function FormField({
  label,
  required,
  hint,
  error,
  className,
  children,
}: {
  label: string;
  required?: boolean;
  hint?: string;
  /** Already translated. */
  error?: string;
  className?: string;
  children: (control: FieldControlProps) => React.ReactNode;
}) {
  const id = useId();
  const hintId = `${id}-hint`;
  const errorId = `${id}-error`;
  const describedBy =
    [hint && hintId, error && errorId].filter(Boolean).join(' ') || undefined;

  return (
    <div className={cn('grid gap-2', className)}>
      <Label htmlFor={id}>
        {label}
        {required && (
          <span aria-hidden="true" className="ms-0.5 text-destructive">
            *
          </span>
        )}
      </Label>
      {children({
        id,
        required,
        'aria-invalid': error ? true : undefined,
        'aria-describedby': describedBy,
      })}
      {hint && !error && (
        <p id={hintId} className="text-xs text-muted-foreground">
          {hint}
        </p>
      )}
      {error && (
        <p id={errorId} className="text-xs font-semibold text-destructive">
          {error}
        </p>
      )}
    </div>
  );
}
