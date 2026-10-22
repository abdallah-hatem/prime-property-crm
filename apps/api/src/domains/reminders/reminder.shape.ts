import type { Prisma } from '@prisma/client';
import type { Reminder } from '@prime-crm/shared';
import { listingLabel } from '../trash/trash.pure';

/** The columns behind the contract's `Reminder`; pass as `select`, map with `toReminder`. */
export const REMINDER_SELECT = {
  id: true,
  kind: true,
  dueAt: true,
  note: true,
  doneAt: true,
  owner: { select: { id: true, name: true } },
  listing: { select: { id: true, type: true, bedrooms: true, area: true } },
  member: { select: { id: true, name: true } },
} as const satisfies Prisma.ReminderSelect;

export type ReminderRow = Prisma.ReminderGetPayload<{
  select: typeof REMINDER_SELECT;
}>;

/** Open and due before `now`. */
export function isOverdue(
  row: { dueAt: Date; doneAt: Date | null },
  now: Date,
): boolean {
  return row.doneAt === null && row.dueAt < now;
}

/**
 * `now` decides `overdue`. The listing title is the English label until the listings task
 * ships the localised title.
 */
export function toReminder(row: ReminderRow, now: Date): Reminder {
  return {
    id: row.id,
    kind: row.kind,
    dueAt: row.dueAt.toISOString(),
    note: row.note,
    doneAt: row.doneAt?.toISOString() ?? null,
    overdue: isOverdue(row, now),
    owner: row.owner,
    listing: row.listing
      ? { id: row.listing.id, title: listingLabel(row.listing) }
      : null,
    member: row.member,
  };
}
