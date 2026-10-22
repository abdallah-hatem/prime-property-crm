import { z } from 'zod';
import { LeadStatusSchema } from './enums';

/**
 * Call outcomes (spec, Shapes → CallOutcome; "Calls and outcomes"). An admin-editable list;
 * each outcome sets a lead status, never LISTED (only a listing does). `inUse`: some call has
 * it, so it can be renamed or hidden but not deleted.
 */
export const OUTCOME_LABEL_MAX_LENGTH = 100;
export const OUTCOME_ORDER_MAX = 10_000;

/** Every lead status except LISTED. */
export const OutcomeStatusSchema = LeadStatusSchema.exclude(['LISTED']);

export const CallOutcomeSchema = z.object({
  id: z.uuid(),
  labelEn: z.string(),
  labelAr: z.string(),
  setsStatus: OutcomeStatusSchema,
  hidden: z.boolean(),
  order: z.number().int(),
  inUse: z.boolean(),
});
export type CallOutcome = z.infer<typeof CallOutcomeSchema>;

export const CallOutcomeErrorCode = {
  /** Some call has this outcome: hide it instead. */
  OUTCOME_IN_USE: 'OUTCOME_IN_USE',
} as const;
export type CallOutcomeErrorCode =
  (typeof CallOutcomeErrorCode)[keyof typeof CallOutcomeErrorCode];

const LabelSchema = z.string().trim().min(1).max(OUTCOME_LABEL_MAX_LENGTH);

/** `POST /call-outcomes` (settings.manage). It goes to the end of the list. */
export const CreateCallOutcomeRequestSchema = z.strictObject({
  labelEn: LabelSchema,
  labelAr: LabelSchema,
  setsStatus: OutcomeStatusSchema,
});
export type CreateCallOutcomeRequest = z.input<
  typeof CreateCallOutcomeRequestSchema
>;

/** `PATCH /call-outcomes/:id` (settings.manage): rename, remap, hide or reorder. */
export const UpdateCallOutcomeRequestSchema = z.strictObject({
  labelEn: LabelSchema.optional(),
  labelAr: LabelSchema.optional(),
  setsStatus: OutcomeStatusSchema.optional(),
  hidden: z.boolean().optional(),
  order: z.number().int().min(0).max(OUTCOME_ORDER_MAX).optional(),
});
export type UpdateCallOutcomeRequest = z.input<
  typeof UpdateCallOutcomeRequestSchema
>;
