import type { Language, Note, Owner, OwnerRow } from '@prime-crm/shared';
import { outcomeLabel } from '../calls/call.shape';
import type {
  OwnerDetailData,
  OwnerRowData,
} from './repositories/owner.repository';

/** `OwnerRow` from its row; outcome labels in `language`. */
export function toOwnerRow(row: OwnerRowData, language: Language): OwnerRow {
  const lastCall = row.calls[0];
  return {
    id: row.id,
    name: row.name,
    phones: row.phones.map((p) => p.phone),
    area: row.area,
    status: row.status,
    assignedTo: row.assignedTo,
    lastCall: lastCall?.outcome
      ? {
          at: lastCall.startedAt.toISOString(),
          outcome: {
            id: lastCall.outcome.id,
            label: outcomeLabel(lastCall.outcome, language),
          },
        }
      : null,
    nextReminderAt: row.reminders[0]?.dueAt.toISOString() ?? null,
    createdAt: row.createdAt.toISOString(),
  };
}

/** `Owner` = the row, its latest notes, its live listing and where it came from. */
export function toOwner(
  row: OwnerDetailData,
  notes: Note[],
  language: Language,
): Owner {
  return {
    ...toOwnerRow(row, language),
    notes,
    listingId: row.listings[0]?.id ?? null,
    source: row.sourceImport
      ? { importId: row.sourceImport.id, fileName: row.sourceImport.fileName }
      : null,
  };
}
