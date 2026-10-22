import { messages, type Locale } from '@prime-crm/shared';
import type { MessageKey, Translate } from '@/i18n/translate';
import type { ApiFailure, ApiUnauthorized } from './api-result';

const STATUS_CODES: Record<number, string> = {
  400: 'VALIDATION_FAILED',
  401: 'UNAUTHORIZED',
  403: 'FORBIDDEN',
  404: 'NOT_FOUND',
  409: 'CONFLICT',
  429: 'TOO_MANY_REQUESTS',
};

const hasErrorKey = (code: string): boolean =>
  Object.prototype.hasOwnProperty.call(messages.en.error, code);

/**
 * The translated message for a failed call: the API's stable `error` code when the locale files
 * know it, else one derived from the HTTP status, else the generic line. Never the API's English
 * `message` — that is for logs.
 */
export function errorMessage(
  t: Translate,
  res: ApiFailure | ApiUnauthorized,
): string {
  if ('networkError' in res && res.networkError) return t('error.network');
  const code =
    res.error && hasErrorKey(res.error) ? res.error : STATUS_CODES[res.status];
  return code && hasErrorKey(code)
    ? t(`error.${code}` as MessageKey)
    : t('error.generic');
}

/** The page's language as the browser sees it (`<html lang>`), for code that can't use hooks. */
export function documentLocale(): Locale {
  return typeof document !== 'undefined' &&
    document.documentElement.lang === 'ar'
    ? 'ar'
    : 'en';
}
