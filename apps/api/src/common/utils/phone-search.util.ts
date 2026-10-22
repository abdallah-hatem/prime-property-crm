import { DEFAULT_COUNTRY_CODE, latinDigits } from '@prime-crm/shared';

/** Parsed `q`: the raw text for names, and the digits to look for in phones (if any). */
export interface TextPhoneSearch {
  text: string;
  /** Digits without leading zeros or the country code: matches inside any stored E.164. */
  phoneDigits: string | null;
}

/** Re-exported: the digit folding now lives with the phone normaliser in packages/shared. */
export { latinDigits };

/** Phone search starts at this many significant digits (fewer would match almost everyone). */
export const PHONE_SEARCH_MIN_DIGITS = 3;

/**
 * `q` matches a name (as typed) or a phone. For phones, separators are ignored and a leading
 * `0`, `+20` or `0020` is dropped, so `0100 123`, `+20100123` and `100123` all find
 * +20100123xxxx. Text with letters is a name search only.
 */
export function parseSearch(
  q: string | undefined,
): TextPhoneSearch | undefined {
  const text = q?.trim();
  if (!text) return undefined;
  const latin = latinDigits(text);
  const looksLikePhone = /^[+\d\s\-.()]+$/.test(latin);
  let digits = looksLikePhone ? latin.replace(/\D/g, '') : '';
  if (latin.trim().startsWith('+') || digits.startsWith('00')) {
    digits = digits.replace(/^0*/, '');
    if (digits.startsWith(DEFAULT_COUNTRY_CODE)) {
      digits = digits.slice(DEFAULT_COUNTRY_CODE.length);
    }
  } else {
    digits = digits.replace(/^0+/, '');
  }
  return {
    text,
    phoneDigits: digits.length >= PHONE_SEARCH_MIN_DIGITS ? digits : null,
  };
}
