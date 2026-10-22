import { z } from 'zod';

/**
 * Deactivate / reactivate contract (spec, "Users — /users"; business doc, flows 8 and 11).
 * `apps/api/src/domains/users/dto/user-status-contract.spec.ts` checks the API DTO agrees.
 */

/** Domain error codes of `POST /users/:id/deactivate` (plus `LAST_ADMIN` from UserErrorCode). */
export const UserStatusErrorCode = {
  /** A user can't deactivate themself. */
  SELF_DEACTIVATE: 'SELF_DEACTIVATE',
  /** `handOverTo` is the user being deactivated, unknown, or not active. */
  INVALID_HANDOVER: 'INVALID_HANDOVER',
} as const;
export type UserStatusErrorCode =
  (typeof UserStatusErrorCode)[keyof typeof UserStatusErrorCode];

/**
 * `POST /users/:id/deactivate`. `handOverTo` is required: an active user's id receives their
 * live owners, listings and open reminders; `null` leaves them unassigned.
 */
export const DeactivateUserRequestSchema = z.strictObject({
  handOverTo: z.uuid().nullable(),
});
export type DeactivateUserRequest = z.infer<typeof DeactivateUserRequestSchema>;

/** What a deactivation moved, as written to the USER_DEACTIVATE activity entry's details. */
export const HandOverCountsSchema = z.object({
  owners: z.number().int().min(0),
  listings: z.number().int().min(0),
  reminders: z.number().int().min(0),
});
export type HandOverCounts = z.infer<typeof HandOverCountsSchema>;
