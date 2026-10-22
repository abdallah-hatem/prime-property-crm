/**
 * Phone normalisation to E.164, Egypt (+20) by default.
 *
 * Accepted Egyptian shapes (spaces, dashes, dots and brackets are ignored):
 *   mobile   01X XXXX XXXX, X in {0,1,2,5}        -> +201XXXXXXXXX
 *   Cairo    02 XXXX XXXX                         -> +202XXXXXXXX
 *   Alex     03 XXX XXXX                          -> +203XXXXXXX
 *   other    0AA XXX XXXX (two-digit area code)   -> +20AAXXXXXXX
 * with the national 0 or a +20 / 0020 prefix in its place.
 * Numbers with another country code are accepted when they look like valid E.164.
 * Arabic-Indic digits (٠١٠… / ۰۱۰…) are read as 0-9.
 *
 * `{ missingTrunkZero: true }` (imports) also accepts an Egyptian number whose national 0 was
 * lost, as when a spreadsheet stores 01001234567 as the number 1001234567.
 */

export const DEFAULT_COUNTRY_CODE = '20';

export type PhoneRejection = 'EMPTY' | 'INVALID';

export type PhoneResult =
  { ok: true; e164: string } | { ok: false; reason: PhoneRejection };

/** Spaces, dashes, dots, brackets and the bidi marks Arabic keyboards insert. */
const SEPARATORS = /[\s\-.()\u200e\u200f]/g;
const EG_MOBILE = /^1[0125]\d{8}$/;
const EG_CAIRO = /^2\d{8}$/;
const EG_ALEX = /^3\d{7}$/;
const EG_AREA = /^(?:4[05-8]|5[057]|6[2456589]|8[2468]|9[2-7])\d{7}$/;
const E164_OTHER = /^[1-9]\d{7,14}$/;
const DIGITS = /^\d+$/;
const ARABIC_INDIC = /[٠-٩۰-۹]/g;

export interface NormalizePhoneOptions {
  /** Accept a bare national significant number (no leading 0), e.g. from a spreadsheet cell. */
  missingTrunkZero?: boolean;
}

/** ٠١٠ / ۰۱۰ → 010: Arabic-Indic and Extended Arabic-Indic digits become 0-9. */
export function latinDigits(text: string): string {
  return text.replace(ARABIC_INDIC, (d) => {
    const code = d.charCodeAt(0);
    return String(code - (code >= 0x06f0 ? 0x06f0 : 0x0660));
  });
}

/** Is `nsn` (national significant number, no leading 0) a dialable Egyptian number? */
function isEgyptianNsn(nsn: string): boolean {
  return (
    EG_MOBILE.test(nsn) ||
    EG_CAIRO.test(nsn) ||
    EG_ALEX.test(nsn) ||
    EG_AREA.test(nsn)
  );
}

function egyptian(nsn: string): PhoneResult {
  return isEgyptianNsn(nsn)
    ? { ok: true, e164: `+${DEFAULT_COUNTRY_CODE}${nsn}` }
    : { ok: false, reason: 'INVALID' };
}

export function normalizePhone(
  input: string | null | undefined,
  options: NormalizePhoneOptions = {},
): PhoneResult {
  if (input == null) return { ok: false, reason: 'EMPTY' };
  const compact = latinDigits(input).replace(SEPARATORS, '');
  if (compact === '') return { ok: false, reason: 'EMPTY' };

  let international: string | null = null;
  if (compact.startsWith('+')) international = compact.slice(1);
  else if (compact.startsWith('00')) international = compact.slice(2);

  if (international !== null) {
    if (!DIGITS.test(international)) return { ok: false, reason: 'INVALID' };
    if (international.startsWith(DEFAULT_COUNTRY_CODE)) {
      return egyptian(international.slice(DEFAULT_COUNTRY_CODE.length));
    }
    return E164_OTHER.test(international)
      ? { ok: true, e164: `+${international}` }
      : { ok: false, reason: 'INVALID' };
  }

  if (!DIGITS.test(compact)) return { ok: false, reason: 'INVALID' };
  // National format: one leading 0 before the significant number.
  if (compact.startsWith('0')) return egyptian(compact.slice(1));
  return options.missingTrunkZero
    ? egyptian(compact)
    : { ok: false, reason: 'INVALID' };
}

/** E.164 string, or null when the input is empty or not a valid phone. */
export function toE164(
  input: string | null | undefined,
  options?: NormalizePhoneOptions,
): string | null {
  const result = normalizePhone(input, options);
  return result.ok ? result.e164 : null;
}
