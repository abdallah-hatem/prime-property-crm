import type {
  AssignableListing,
  AssignableOwner,
} from './repositories/assignment.repository';

/** What one reassignment touches once owners and listings are paired up. */
export interface AssignmentPlan {
  /** Every live owner in the batch (asked for directly or linked to an asked-for listing). */
  ownerIds: string[];
  /** Every live listing in the batch (asked for directly or linked to an asked-for owner). */
  listingIds: string[];
  /** Owners whose member actually changes: one timeline entry each. */
  changedOwners: AssignableOwner[];
}

/**
 * Pairs owners with their listings so both end up with `toMemberId` (business doc: an owner and
 * its listing always have the same member). Duplicates collapse; only real changes get a
 * timeline row.
 */
export function planAssignment(
  owners: AssignableOwner[],
  listings: AssignableListing[],
  toMemberId: string | null,
): AssignmentPlan {
  const ownerById = new Map(owners.map((o) => [o.id, o]));
  return {
    ownerIds: [...ownerById.keys()],
    listingIds: [...new Set(listings.map((l) => l.id))],
    changedOwners: [...ownerById.values()].filter(
      (o) => o.assignedToId !== toMemberId,
    ),
  };
}
