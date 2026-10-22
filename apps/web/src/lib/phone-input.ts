/**
 * Typing rules for an Egyptian mobile field: 11 digits starting with 01. The final, canonical
 * check (and E.164 normalisation) is `normalizePhone` in @prime-crm/shared, which the API repeats.
 */

/** Digits only, with a pasted international prefix (+20 / 0020 / 20…) turned into the local 0. */
export function normalizeEgyptianMobileInput(input: string): string {
  let digits = input.replace(/\D/g, '');
  if (digits.startsWith('0020')) digits = `0${digits.slice(4)}`;
  else if (digits.startsWith('20') && digits.length === 12)
    digits = `0${digits.slice(2)}`;
  return digits;
}

/** A value on its way to 01XXXXXXXXX: empty, "0", or "01" plus up to 9 digits. */
export const EG_MOBILE_PARTIAL = /^(0|01\d{0,9})?$/;
/** A complete Egyptian mobile number. */
export const EG_MOBILE = /^01\d{9}$/;

/**
 * The value a change should leave in the field, or `null` to reject it (the field keeps its old
 * value — trimming would drop the last digit when one is typed in the middle).
 */
export function acceptMobileChange(raw: string): string | null {
  const next = normalizeEgyptianMobileInput(raw);
  return EG_MOBILE_PARTIAL.test(next) ? next : null;
}
