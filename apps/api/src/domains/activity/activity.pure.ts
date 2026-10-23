import type { Prisma } from '@prisma/client';
import type { ActivityRow } from '../../common/repositories/activity-entry.repository';
import type {
  ActivityEntryView,
  ActivityRecordInput,
} from './interfaces/activity.interface';

/** The columns of one entry to append (the target flattened; no details → none stored). */
export function toActivityWrite(entry: ActivityRecordInput) {
  return {
    type: entry.type,
    actorId: entry.actorId,
    summary: entry.summary,
    targetKind: entry.target?.kind ?? null,
    targetId: entry.target?.id ?? null,
    targetLabel: entry.target?.label ?? null,
    details: (entry.details ?? undefined) as Prisma.InputJsonValue | undefined,
  };
}

/** A stored row as the contract's ActivityEntry: the target only when it was recorded. */
export function toActivityEntry(row: ActivityRow): ActivityEntryView {
  return {
    id: row.id,
    type: row.type,
    actor: row.actor,
    summary: row.summary,
    target:
      row.targetKind && row.targetId
        ? {
            kind: row.targetKind,
            id: row.targetId,
            label: row.targetLabel ?? '',
          }
        : null,
    details: row.details ?? null,
    createdAt: row.createdAt,
  };
}
