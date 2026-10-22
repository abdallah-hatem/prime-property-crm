import { z } from 'zod';
import { LeadStatusSchema } from './enums';
import { UserSummarySchema } from './summary';

/**
 * `Call` (spec, Shapes). T6 needs it for the owner timeline; the calls task extends this file
 * with the request schemas. `outcome.label` is in the caller's language.
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
