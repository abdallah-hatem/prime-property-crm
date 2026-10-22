'use client';

import { useSyncExternalStore } from 'react';
import { Monitor, Moon, Sun } from 'lucide-react';
import { useTheme } from 'next-themes';
import { useTranslation } from '@/i18n/i18n-provider';
import { SegmentedControl } from './segmented-control';
import { THEMES, type ThemeChoice } from './theme-provider';

const ICONS: Record<ThemeChoice, React.ReactNode> = {
  light: <Sun aria-hidden className="size-4" />,
  dark: <Moon aria-hidden className="size-4" />,
  system: <Monitor aria-hidden className="size-4" />,
};

const subscribeNoop = () => () => {};

/** True after hydration; the stored theme is only known in the browser. */
function useMounted(): boolean {
  return useSyncExternalStore(
    subscribeNoop,
    () => true,
    () => false,
  );
}

function isThemeChoice(value: string | undefined): value is ThemeChoice {
  return (THEMES as readonly string[]).includes(value ?? '');
}

export function ThemeToggle({ className }: { className?: string }) {
  const { theme, setTheme } = useTheme();
  const { t } = useTranslation();
  const mounted = useMounted();

  return (
    <SegmentedControl
      className={className}
      label={t('theme.label')}
      value={mounted && isThemeChoice(theme) ? theme : undefined}
      onChange={setTheme}
      options={THEMES.map((value) => ({
        value,
        label: t(`theme.${value}`),
        icon: ICONS[value],
      }))}
    />
  );
}
