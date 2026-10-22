'use client';

import { useTranslation } from '@/i18n/i18n-provider';
import { formatNumber } from '@/lib/format';
import { cn } from '@/lib/utils';

/** A whole-EGP amount, grouped (`EGP 1,500,000` / `1,500,000 ج.م`), digits in the numeral face. */
export function MoneyText({
  value,
  className,
}: {
  value: number;
  className?: string;
}) {
  const { t } = useTranslation();
  const [before, after] = t('money.amount').split('{amount}');
  return (
    <span className={cn('whitespace-nowrap', className)}>
      {before}
      <bdi className="font-numeric tabular-nums">{formatNumber(value)}</bdi>
      {after}
    </span>
  );
}
