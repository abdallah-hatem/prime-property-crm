'use client';

import { useEffect } from 'react';
import { useTheme } from 'next-themes';
import { BROWSER_CHROME_COLOURS } from '@/lib/pwa';

/**
 * The status bar follows the app's theme, not only the phone's: someone who picked Dark on a
 * light phone gets a dark status bar. The server-rendered theme-color metas carry
 * `prefers-color-scheme` media for the first paint; once the chosen theme is known both are set
 * to that theme's page colour.
 */
export function ThemeColorSync() {
  const { resolvedTheme } = useTheme();

  useEffect(() => {
    if (resolvedTheme !== 'light' && resolvedTheme !== 'dark') return;
    const colour = BROWSER_CHROME_COLOURS[resolvedTheme];
    document
      .querySelectorAll<HTMLMetaElement>('meta[name="theme-color"]')
      .forEach((meta) => meta.setAttribute('content', colour));
  }, [resolvedTheme]);

  return null;
}
