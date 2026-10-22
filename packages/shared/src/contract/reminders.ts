import { z } from 'zod';
import { ReminderKindSchema } from './enums';
import { UserSummarySchema } from './summary';

/**
 * Reminders (spec, Shapes → Reminder; "Reminders and today"). T6 ships the shape and
 * `GET /reminders?unassigned=true`; the calls/reminders task extends this file with the rest.
 *
 * `member: null` means unassigned: the reminder belongs to an unassigned owner or listing and
 * follows it to the next member it is assigned to.
 */
export const ReminderSchema = z.object({
  id: z.uuid(),
  kind: ReminderKindSchema,
  dueAt: z.string(),
  note: z.string().nullable(),
  doneAt: z.string().nullable(),
  overdue: z.boolean(),
  owner: z.object({ id: z.uuid(), name: z.string() }).nullable(),
  listing: z.object({ id: z.uuid(), title: z.string() }).nullable(),
  member: UserSummarySchema.nullable(),
});
export type Reminder = z.infer<typeof ReminderSchema>;
