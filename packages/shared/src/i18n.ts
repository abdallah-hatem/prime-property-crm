import en from './locales/en.json';
import ar from './locales/ar.json';
import type { Language } from './contract/enums';

export type Locale = Language;
export type Messages = typeof en;

export const LOCALES = ['en', 'ar'] as const satisfies readonly Locale[];
export const DEFAULT_LOCALE: Locale = 'en';
/** Cookie the web reads on the server so the first paint is already in the user's language. */
export const LOCALE_COOKIE = 'prime_locale';

/** `ar` must carry every key `en` has; the type check enforces it, the test guards extra keys. */
export const messages: Record<Locale, Messages> = { en, ar };

export function isLocale(value: unknown): value is Locale {
  return typeof value === 'string' && (LOCALES as readonly string[]).includes(value);
}

export function directionOf(locale: Locale): 'ltr' | 'rtl' {
  return locale === 'ar' ? 'rtl' : 'ltr';
}

/** Every dotted key path in a messages object, sorted — used to compare locales. */
export function keyPaths(tree: object, prefix = ''): string[] {
  return Object.entries(tree)
    .flatMap(([key, value]: [string, unknown]) =>
      value !== null && typeof value === 'object'
        ? keyPaths(value, `${prefix}${key}.`)
        : [`${prefix}${key}`],
    )
    .sort();
}
