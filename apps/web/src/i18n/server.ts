import 'server-only';
import { cookies } from 'next/headers';
import {
  DEFAULT_LOCALE,
  isLocale,
  LOCALE_COOKIE,
  type Locale,
} from '@prime-crm/shared';
import { createTranslator } from './translate';

/** The request's locale, from the cookie, so the server renders the user's language first. */
export async function getLocale(): Promise<Locale> {
  const value = (await cookies()).get(LOCALE_COOKIE)?.value;
  return isLocale(value) ? value : DEFAULT_LOCALE;
}

export async function getTranslator() {
  return createTranslator(await getLocale());
}
