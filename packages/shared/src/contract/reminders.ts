import { z } from 'zod';
import { CallSchema } from './calls';
import { ReminderKindSchema } from './enums';
import { NoteBodySchema } from './notes';
import { UserSummarySchema } from './summary';

/**
 * Reminders (spec, Shapes → Reminder; "Reminders and today").
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

/** Domain error codes of the reminder endpoints (and of a call outcome's reminder). */
export const ReminderErrorCode = {
  /** `dueAt` is not in the future. */
  REMINDER_IN_PAST: 'REMINDER_IN_PAST',
  /** The reminder is already done: it can't be edited. */
  REMINDER_DONE: 'REMINDER_DONE',
  /**
   * An ad reminder closes only through its listing: `AD_TAKE_DOWN` when the ad is marked Taken
   * down (and its due time can't be moved), `AD_CHECK_IN` through a check-in.
   */
  SYSTEM_REMINDER: 'SYSTEM_REMINDER',
} as const;
export type ReminderErrorCode =
  (typeof ReminderErrorCode)[keyof typeof ReminderErrorCode];

/** Each list of `GET /me/today` holds at most this many items. */
export const TODAY_LIST_MAX = 50;

/** An ISO 8601 instant with its zone (`2026-10-22T09:00:00Z`, `...+03:00`). */
export const InstantSchema = z.iso.datetime({ offset: true });

/** A reminder's due time and note: a call outcome's `reminder`. */
export const ReminderInputSchema = z.strictObject({
  dueAt: InstantSchema,
  note: NoteBodySchema.optional(),
});
export type ReminderInput = z.input<typeof ReminderInputSchema>;

/** `POST /reminders`: exactly one of `ownerId` / `listingId` (400 for both or neither). */
export const CreateReminderRequestSchema = z
  .strictObject({
    ownerId: z.uuid().optional(),
    listingId: z.uuid().optional(),
    dueAt: InstantSchema,
    note: NoteBodySchema.optional(),
  })
  .refine(
    (body) => (body.ownerId === undefined) !== (body.listingId === undefined),
    'exactly one of ownerId and listingId is required',
  );
export type CreateReminderRequest = z.input<typeof CreateReminderRequestSchema>;

/** `PATCH /reminders/:id`. `note: null` clears the note. */
export const UpdateReminderRequestSchema = z.strictObject({
  dueAt: InstantSchema.optional(),
  note: NoteBodySchema.nullable().optional(),
});
export type UpdateReminderRequest = z.input<typeof UpdateReminderRequestSchema>;

export const ReminderStateSchema = z.enum(['open', 'done']);
export type ReminderState = z.infer<typeof ReminderStateSchema>;

/**
 * `when` splits time at now and at the end of today (Cairo): `overdue` = open and due before
 * now; `today` = due from now to the end of today; `upcoming` = due after today.
 */
export const ReminderWhenSchema = z.enum(['overdue', 'today', 'upcoming']);
export type ReminderWhen = z.infer<typeof ReminderWhenSchema>;

/**
 * `GET /me/today`, each list ≤ TODAY_LIST_MAX. `overdue` and `dueToday` hold manual
 * reminders; `adTasks` the open take-down tasks and the check-ins due by the end of today.
 */
export const TodaySchema = z.object({
  outcomeMissing: z.array(CallSchema),
  overdue: z.array(ReminderSchema),
  dueToday: z.array(ReminderSchema),
  adTasks: z.array(ReminderSchema),
  counts: z.object({
    callsToday: z.number().int(),
    remindersOpen: z.number().int(),
  }),
});
export type Today = z.infer<typeof TodaySchema>;
