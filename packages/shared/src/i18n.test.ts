import { describe, expect, it } from 'vitest';
import { directionOf, isLocale, keyPaths, messages } from './i18n';

describe('locales', () => {
  it('en and ar have identical key sets', () => {
    expect(keyPaths(messages.ar)).toEqual(keyPaths(messages.en));
  });

  it('no translation is left empty', () => {
    for (const locale of ['en', 'ar'] as const) {
      const empty = keyPaths(messages[locale]).filter((path) => {
        const value = path
          .split('.')
          .reduce<unknown>(
            (node, key) => (node as Record<string, unknown>)[key],
            messages[locale],
          );
        return typeof value !== 'string' || value.trim() === '';
      });
      expect(empty, locale).toEqual([]);
    }
  });

  it('recognises only supported locales', () => {
    expect(isLocale('ar')).toBe(true);
    expect(isLocale('fr')).toBe(false);
    expect(isLocale(undefined)).toBe(false);
  });

  it('Arabic is right-to-left', () => {
    expect(directionOf('ar')).toBe('rtl');
    expect(directionOf('en')).toBe('ltr');
  });
});
