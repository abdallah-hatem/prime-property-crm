import type { LeadStatus } from '@prime-crm/shared';

/**
 * Statuses a call outcome never changes: LISTED (only a listing sets or clears it) and
 * DO_NOT_CALL (only the admin clears it, through the owner).
 */
export const OUTCOME_LOCKED_STATUSES: readonly LeadStatus[] = [
  'LISTED',
  'DO_NOT_CALL',
];

/**
 * The owner's status after an outcome is set, or null to leave it. The latest call with an
 * outcome decides: an outcome on an older call never overrides a newer call's.
 */
export function statusAfterOutcome(
  current: LeadStatus,
  setsStatus: LeadStatus,
  newerOutcomeExists: boolean,
): LeadStatus | null {
  if (newerOutcomeExists) return null;
  if (OUTCOME_LOCKED_STATUSES.includes(current)) return null;
  return current === setsStatus ? null : setsStatus;
}

/** Why a call can't be started on an owner in this status, or null when it can. */
export function callRefusal(
  status: LeadStatus,
): 'DO_NOT_CALL' | 'OWNER_LISTED' | null {
  if (status === 'DO_NOT_CALL') return 'DO_NOT_CALL';
  if (status === 'LISTED') return 'OWNER_LISTED';
  return null;
}
