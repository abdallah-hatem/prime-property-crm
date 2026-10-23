import type { UserSummary } from '../../common/interfaces/user-summary.interface';
import type { ActivityRecordInput } from '../activity/interfaces/activity.interface';

/** What an assignment batch was about: the owners or the listings the caller picked. */
export type AssignKind = 'OWNERS' | 'LISTINGS';

/** One assignment batch for the activity log. */
export interface AssignBatch {
  kind: AssignKind;
  /** Records of `kind` the batch assigned. */
  count: number;
  /** The member they went to; null = unassigned. */
  assignee: UserSummary | null;
  /**
   * A listings batch only: owner leads that moved with their new listing (a listing created
   * or imported with an owner's phone). Left out of the entry when 0 or absent.
   */
  linkedOwners?: number;
}

const plural = (count: number, noun: string): string =>
  `${count} ${noun}${count === 1 ? '' : 's'}`;

/**
 * The ASSIGN activity entry of one batch (business doc: "each assign batch is one activity
 * entry"). Every place that assigns work — owners and listings assign, owner create, a direct
 * listing that moves a lead, imports — records through this, so the text and details agree:
 * `details: { kind, count, assigneeId }`, plus `linkedOwners` when a listings batch moved leads.
 */
export function assignActivity(
  actorId: string,
  batch: AssignBatch,
): ActivityRecordInput {
  const { kind, count, assignee } = batch;
  const linkedOwners = batch.linkedOwners ?? 0;
  const what =
    plural(count, kind === 'OWNERS' ? 'owner' : 'listing') +
    (linkedOwners > 0 ? ` (with ${plural(linkedOwners, 'owner lead')})` : '');
  return {
    type: 'ASSIGN',
    actorId,
    summary: assignee
      ? `Assigned ${what} to ${assignee.name}`
      : `Unassigned ${what}`,
    target: assignee
      ? { kind: 'USER', id: assignee.id, label: assignee.name }
      : null,
    details: {
      kind,
      count,
      assigneeId: assignee?.id ?? null,
      ...(linkedOwners > 0 ? { linkedOwners } : {}),
    },
  };
}
