import {
  DEFAULT_COUNTRY_CODE,
  type LeadStatus,
  type OwnerSort,
} from '@prime-crm/shared';
import type { OwnerSearch } from './interfaces/owner.interface';

/**
 * Calling-list order after the reminder buckets (business doc): New, Call back, Contacted,
 * Interested, Not interested. Listed and Do not call owners never appear.
 */
export const CALLING_STATUS_ORDER = [
  'NEW',
  'CALL_BACK',
  'CONTACTED',
  'INTERESTED',
  'NOT_INTERESTED',
] as const satisfies readonly LeadStatus[];

export const NEVER_IN_CALLING_LIST = [
  'LISTED',
  'DO_NOT_CALL',
] as const satisfies readonly LeadStatus[];

/** The latest notes an `Owner` carries. */
export const OWNER_LATEST_NOTES = 3;

const ARABIC_INDIC = /[٠-٩۰-۹]/g;

/** ٠١٠ / ۰۱۰ → 010, so a phone typed on an Arabic keyboard still matches. */
export function latinDigits(text: string): string {
  return text.replace(ARABIC_INDIC, (d) => {
    const code = d.charCodeAt(0);
    return String(code - (code >= 0x06f0 ? 0x06f0 : 0x0660));
  });
}

/** Phone search starts at this many significant digits (fewer would match almost everyone). */
export const PHONE_SEARCH_MIN_DIGITS = 3;

/**
 * `q` matches a name (as typed) or a phone. For phones, separators are ignored and a leading
 * `0`, `+20` or `0020` is dropped, so `0100 123`, `+20100123` and `100123` all find
 * +20100123xxxx. Text with letters is a name search only.
 */
export function parseSearch(q: string | undefined): OwnerSearch | undefined {
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

/** What `doNotCall` in a PATCH does to the lead status. */
export type DoNotCallChange =
  | { kind: 'none' }
  | { kind: 'set'; status: LeadStatus }
  | { kind: 'forbidden' }
  | { kind: 'listed' };

/**
 * `true` sets Do not call (anyone with access to the owner; refused on a Listed owner, which
 * leaves the calling list through its listing). `false` clears it back to Contacted and needs
 * owners.viewAll. Asking for the state the owner is already in changes nothing.
 */
export function doNotCallChange(
  current: LeadStatus,
  doNotCall: boolean | undefined,
  canClear: boolean,
): DoNotCallChange {
  if (doNotCall === undefined) return { kind: 'none' };
  if (doNotCall) {
    if (current === 'DO_NOT_CALL') return { kind: 'none' };
    if (current === 'LISTED') return { kind: 'listed' };
    return { kind: 'set', status: 'DO_NOT_CALL' };
  }
  if (!canClear) return { kind: 'forbidden' };
  return current === 'DO_NOT_CALL'
    ? { kind: 'set', status: 'CONTACTED' }
    : { kind: 'none' };
}

/** `sort` → the Prisma-style order (stable: ties by id). Default: newest first. */
export function ownerOrder(sort: OwnerSort | undefined) {
  switch (sort) {
    case 'name':
      return [{ name: 'asc' as const }, { id: 'asc' as const }];
    case 'lastCall':
      return [
        { lastCallAt: { sort: 'desc' as const, nulls: 'last' as const } },
        { id: 'desc' as const },
      ];
    default:
      return [{ createdAt: 'desc' as const }, { id: 'desc' as const }];
  }
}
