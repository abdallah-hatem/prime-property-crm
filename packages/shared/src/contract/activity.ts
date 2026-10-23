import { z } from 'zod';
import { ActivityTypeSchema } from './enums';
import { InstantSchema } from './reminders';
import { UserSummarySchema } from './summary';

/** What an activity entry is about: an id with a label snapshot that outlives a purge. */
export const ActivityTargetSchema = z.object({
  kind: z.string(),
  id: z.string(),
  label: z.string(),
});
export type ActivityTarget = z.infer<typeof ActivityTargetSchema>;

/**
 * `ActivityEntry` (spec, Shapes): one row of `GET /activity`. `summary` is the API's English
 * sentence (screens build their own from type, target and details); `details` is small
 * structured data per type, e.g. IMPORT `{ kind, counts, assignToId }`, ASSIGN
 * `{ kind, count, assigneeId, linkedOwners? }`.
 */
export const ActivityEntrySchema = z.object({
  id: z.uuid(),
  type: ActivityTypeSchema,
  actor: UserSummarySchema,
  summary: z.string(),
  target: ActivityTargetSchema.nullable(),
  details: z.record(z.string(), z.unknown()).nullable(),
  createdAt: InstantSchema,
});
export type ActivityEntry = z.infer<typeof ActivityEntrySchema>;
