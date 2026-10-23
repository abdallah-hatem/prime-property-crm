import type { ImportCounts, ImportKind } from '@prime-crm/shared';
import type { ActivityRecordInput } from '../activity/interfaces/activity.interface';

/** The job fields an IMPORT entry describes. */
export interface ImportActivityJob {
  id: string;
  kind: ImportKind;
  fileName: string;
  assignToId: string | null;
}

/**
 * The IMPORT activity entry of one confirmed import: `details: { kind, counts, assignToId }`.
 * The service and the sample seed both write through this, so the log reads the same.
 */
export function importActivity(
  actorId: string,
  job: ImportActivityJob,
  counts: ImportCounts,
): ActivityRecordInput {
  const noun = job.kind === 'OWNERS' ? 'owner' : 'listing';
  return {
    type: 'IMPORT',
    actorId,
    summary: `Imported ${counts.added} ${noun}${counts.added === 1 ? '' : 's'} from ${job.fileName} (${counts.duplicates} duplicate, ${counts.rejected} rejected)`,
    target: { kind: 'IMPORT', id: job.id, label: job.fileName },
    details: { kind: job.kind, counts, assignToId: job.assignToId },
  };
}
