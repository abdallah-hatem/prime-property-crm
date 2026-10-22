import type { ActivityType } from '@prime-crm/shared';
import type { UserSummary } from '../../../common/interfaces/user-summary.interface';

/** What a record is about: an id with no foreign key plus a label snapshot, so it outlives a purge. */
export interface ActivityTarget {
  kind: string;
  id: string;
  label: string;
}

/** One entry to append with `ActivityService.record(tx, entry)`. */
export interface ActivityRecordInput {
  type: ActivityType;
  actorId: string;
  /** An English sentence for the log ("Deleted owner Ahmed Ali"). */
  summary: string;
  target?: ActivityTarget | null;
  /** Small structured detail (counts, from/to ids). Never secrets or whole records. */
  details?: Record<string, unknown> | null;
}

/** The ActivityEntry shape of the API contract (spec, Shapes). */
export interface ActivityEntryView {
  id: string;
  type: ActivityType;
  actor: UserSummary;
  summary: string;
  target: ActivityTarget | null;
  details: unknown;
  createdAt: Date;
}
