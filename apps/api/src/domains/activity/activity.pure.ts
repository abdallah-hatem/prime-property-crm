import type { ActivityRow } from '../../common/repositories/activity-entry.repository';
import type { ActivityEntryView } from './interfaces/activity.interface';

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
