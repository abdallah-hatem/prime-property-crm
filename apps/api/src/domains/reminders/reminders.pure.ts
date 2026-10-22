import type {
  ReminderKind,
  ReminderState,
  ReminderWhen,
} from '@prime-crm/shared';
import type { Prisma } from '@prisma/client';

/**
 * Reminder rules with no I/O. `when` splits time at `now` and at `endOfToday` (the first
 * instant after today in Cairo): overdue = open and due before now; today = due from now to the
 * end of today; upcoming = due after today.
 */
export function whenWhere(
  when: ReminderWhen,
  now: Date,
  endOfToday: Date,
): Prisma.ReminderWhereInput {
  switch (when) {
    case 'overdue':
      return { doneAt: null, dueAt: { lt: now } };
    case 'today':
      return { dueAt: { gte: now, lt: endOfToday } };
    case 'upcoming':
      return { dueAt: { gte: endOfToday } };
  }
}

export function stateWhere(state: ReminderState): Prisma.ReminderWhereInput {
  return state === 'open' ? { doneAt: null } : { doneAt: { not: null } };
}

/**
 * Open first (so overdue reminders lead the list), then by due time; done ones after them,
 * most recently done first.
 */
export const REMINDER_LIST_ORDER: Prisma.ReminderOrderByWithRelationInput[] = [
  { doneAt: { sort: 'desc', nulls: 'first' } },
  { dueAt: 'asc' },
  { id: 'asc' },
];

/** Ad reminders close only through their listing (take-down / check-in), never by hand. */
export function isSystemKind(kind: ReminderKind): boolean {
  return kind !== 'MANUAL';
}

export type EditRefusal = 'DONE' | 'SYSTEM' | null;

/**
 * Why an edit is refused: a done reminder can't change (409 REMINDER_DONE); a take-down task's
 * due time can't move (400 SYSTEM_REMINDER). Its note, and a check-in's due time, can.
 */
export function editRefusal(
  reminder: { kind: ReminderKind; doneAt: Date | null },
  change: { dueAt?: unknown },
): EditRefusal {
  if (reminder.doneAt) return 'DONE';
  if (reminder.kind === 'AD_TAKE_DOWN' && change.dueAt !== undefined) {
    return 'SYSTEM';
  }
  return null;
}

/** A reminder must be due after now. */
export function isInPast(dueAt: Date, now: Date): boolean {
  return dueAt.getTime() <= now.getTime();
}
