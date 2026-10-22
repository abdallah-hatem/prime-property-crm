'use client';

import { LOCALES } from '@prime-crm/shared';
import { useTranslation } from '@/i18n/i18n-provider';
import { SegmentedControl } from './segmented-control';

export function LocaleSwitch({ className }: { className?: string }) {
  const { t, locale, setLocale, isSwitching } = useTranslation();

  return (
    <SegmentedControl
      className={className}
      label={t('language.label')}
      value={locale}
      onChange={setLocale}
      disabled={isSwitching}
      options={LOCALES.map((value) => ({
        value,
        label: t(`language.${value}`),
      }))}
    />
  );
}
