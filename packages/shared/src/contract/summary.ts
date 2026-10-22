import { z } from 'zod';

/** `UserSummary { id, name }` (spec, Shapes): who a record is assigned to, who wrote a note. */
export const UserSummarySchema = z.object({ id: z.uuid(), name: z.string() });
export type UserSummary = z.infer<typeof UserSummarySchema>;
