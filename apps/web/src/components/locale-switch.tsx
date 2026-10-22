'use client';

import { LOCALES, type Locale } from '@prime-crm/shared';
import { useTranslation } from '@/i18n/i18n-provider';
import { SegmentedControl } from './segmented-control';

export function LocaleSwitch({
  className,
  onSwitch,
}: {
  className?: string;
  /** Called after the switch, e.g. to save the language on the account. */
  onSwitch?: (locale: Locale) => void;
}) {
  const { t, locale, setLocale, isSwitching } = useTranslation();

  return (
    <SegmentedControl
      className={className}
      label={t('language.label')}
      value={locale}
      onChange={(next) => {
        if (next === locale) return;
        setLocale(next);
        onSwitch?.(next);
      }}
      disabled={isSwitching}
      options={LOCALES.map((value) => ({
        value,
        label: t(`language.${value}`),
      }))}
    />
  );
}
