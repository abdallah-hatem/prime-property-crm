'use client';

import { Input } from '@/components/ui/input';
import { useTranslation } from '@/i18n/i18n-provider';
import { acceptMobileChange } from '@/lib/phone-input';
import { cn } from '@/lib/utils';

type PhoneInputProps = Omit<
  React.ComponentProps<typeof Input>,
  'type' | 'value' | 'onChange' | 'maxLength' | 'inputMode'
> & {
  /** The 11-digit local string (`01012345678`); never a number, never formatted. */
  value: string;
  onChange: (value: string) => void;
};

/**
 * An Egyptian mobile field: digits only, 11 max, must start with 01. A 12th digit or an
 * impossible prefix is never entered (the change is rejected, not trimmed); a pasted `+20 10…` or
 * `0020 10…` is turned into `010…`. No `maxLength` — it would clip the paste before it's normalised.
 * Validate the complete value on submit with `EG_MOBILE`.
 */
export function PhoneInput({
  value,
  onChange,
  className,
  placeholder,
  ...props
}: PhoneInputProps) {
  const { t } = useTranslation();
  return (
    <Input
      type="text"
      inputMode="numeric"
      autoComplete="tel-national"
      dir="ltr"
      placeholder={placeholder ?? t('form.phonePlaceholder')}
      className={cn('font-numeric tabular-nums rtl:text-end', className)}
      value={value}
      onChange={(event) => {
        const next = acceptMobileChange(event.target.value);
        if (next !== null) onChange(next);
      }}
      {...props}
    />
  );
}
