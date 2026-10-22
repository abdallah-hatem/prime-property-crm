import { z } from 'zod';
import { PhoneInputSchema } from './auth';
import { LeadStatusSchema } from './enums';
import { NoteBodySchema } from './notes';
import { UserSummarySchema } from './summary';

/**
 * Calls (spec, Shapes → Call; "Calls and outcomes"). `outcome.label` is in the caller's
 * language. Calls are never edited or deleted; the outcome is set once.
 */
export const CallSchema = z.object({
  id: z.uuid(),
  owner: z.object({ id: z.uuid().nullable(), name: z.string() }),
  member: UserSummarySchema,
  phone: z.string(),
  startedAt: z.string(),
  outcome: z
    .object({ id: z.uuid(), label: z.string(), setsStatus: LeadStatusSchema })
    .nullable(),
  note: z.string().nullable(),
  outcomeAt: z.string().nullable(),
});
export type Call = z.infer<typeof CallSchema>;

/** Domain error codes of the call endpoints (plus `REMINDER_IN_PAST` from reminders). */
export const CallErrorCode = {
  /** The owner is Do not call. */
  DO_NOT_CALL: 'DO_NOT_CALL',
  /** The owner is Listed: it is handled through its listing. */
  OWNER_LISTED: 'OWNER_LISTED',
  /** The phone is not one of the owner's numbers. */
  PHONE_NOT_OWNERS: 'PHONE_NOT_OWNERS',
  /** The same `clientRequestId` was already used for a call on another owner. */
  REQUEST_ID_REUSED: 'REQUEST_ID_REUSED',
  /** The call already has its outcome. */
  OUTCOME_ALREADY_SET: 'OUTCOME_ALREADY_SET',
  /** The outcome is hidden: it can't be picked any more. */
  OUTCOME_HIDDEN: 'OUTCOME_HIDDEN',
} as const;
export type CallErrorCode = (typeof CallErrorCode)[keyof typeof CallErrorCode];

/**
 * `POST /owners/:id/calls`. `phone`: one of the owner's numbers, typed any way.
 * `clientRequestId`: a UUID the client generates per tap; a repeat returns the same call.
 */
export const StartCallRequestSchema = z.strictObject({
  phone: PhoneInputSchema,
  clientRequestId: z.uuid(),
});
export type StartCallRequest = z.input<typeof StartCallRequestSchema>;

/**
 * `POST /calls/:id/outcome`. The optional reminder goes on the call's owner in the same
 * transaction: a reminder in the past saves nothing.
 */
export const SetCallOutcomeRequestSchema = z.strictObject({
  outcomeId: z.uuid(),
  note: NoteBodySchema.optional(),
  reminder: z
    .strictObject({
      dueAt: z.iso.datetime({ offset: true }),
      note: NoteBodySchema.optional(),
    })
    .optional(),
});
export type SetCallOutcomeRequest = z.input<typeof SetCallOutcomeRequestSchema>;
