'use client';

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useTransition,
} from 'react';
import { useRouter } from 'next/navigation';
import { Direction } from 'radix-ui';
import { directionOf, LOCALE_COOKIE, type Locale } from '@prime-crm/shared';
import { createTranslator, type Translate } from './translate';

const ONE_YEAR_SECONDS = 60 * 60 * 24 * 365;

interface I18nContextValue {
  locale: Locale;
  dir: 'ltr' | 'rtl';
  t: Translate;
  setLocale: (locale: Locale) => void;
  isSwitching: boolean;
}

const I18nContext = createContext<I18nContextValue | null>(null);

export function I18nProvider({
  locale,
  children,
}: {
  locale: Locale;
  children: React.ReactNode;
}) {
  const router = useRouter();
  const [isSwitching, startTransition] = useTransition();

  const setLocale = useCallback(
    (next: Locale) => {
      document.cookie = `${LOCALE_COOKIE}=${next}; path=/; max-age=${ONE_YEAR_SECONDS}; samesite=lax`;
      // The server reads the cookie, so a refresh re-renders <html lang dir> and every string.
      startTransition(() => router.refresh());
    },
    [router],
  );

  const value = useMemo(
    () => ({
      locale,
      dir: directionOf(locale),
      t: createTranslator(locale),
      setLocale,
      isSwitching,
    }),
    [locale, setLocale, isSwitching],
  );

  // Radix primitives (Select, RadioGroup, menus) read the direction from here, not from <html dir>.
  return (
    <I18nContext.Provider value={value}>
      <Direction.Provider dir={value.dir}>{children}</Direction.Provider>
    </I18nContext.Provider>
  );
}

export function useTranslation(): I18nContextValue {
  const context = useContext(I18nContext);
  if (!context)
    throw new Error('useTranslation must be used inside <I18nProvider>');
  return context;
}
