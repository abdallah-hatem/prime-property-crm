import type { LeadStatus, OwnerSort } from '@prime-crm/shared';

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

// Name-or-phone search moved to common (listings search uses it too); re-exported for owners.
export {
  latinDigits,
  parseSearch,
  PHONE_SEARCH_MIN_DIGITS,
} from '../../common/utils/phone-search.util';

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
