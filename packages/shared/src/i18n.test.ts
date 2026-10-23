import { describe, expect, it } from 'vitest';
import * as contract from './contract';
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

  it('every error code in the contract has an English and an Arabic message', () => {
    const codes = Object.entries(contract)
      .filter(
        ([name, value]) =>
          name.endsWith('ErrorCode') && typeof value === 'object',
      )
      .flatMap(([, value]) => Object.values(value as Record<string, string>));
    expect(codes.length).toBeGreaterThan(40);
    for (const locale of ['en', 'ar'] as const) {
      const errors = messages[locale].error as Record<string, string>;
      const missing = codes.filter((code) => !errors[code]?.trim());
      expect(missing, locale).toEqual([]);
    }
  });
});
