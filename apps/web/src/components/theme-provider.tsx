'use client';

import { ThemeProvider as NextThemesProvider } from 'next-themes';

export const THEMES = ['light', 'dark', 'system'] as const;
export type ThemeChoice = (typeof THEMES)[number];

/**
 * Light / dark / system, stored per browser. next-themes sets the class on <html> from an
 * inline script before first paint, so there is no flash of the wrong theme.
 */
export function ThemeProvider({ children }: { children: React.ReactNode }) {
  return (
    <NextThemesProvider
      attribute="class"
      defaultTheme="system"
      enableSystem
      disableTransitionOnChange
      themes={['light', 'dark']}
    >
      {children}
    </NextThemesProvider>
  );
}
