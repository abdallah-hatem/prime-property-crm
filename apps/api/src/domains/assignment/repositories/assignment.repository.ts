import { Injectable } from '@nestjs/common';
import type { Tx } from '../../../common/interfaces/transaction.interface';

export interface AssignableOwner {
  id: string;
  assignedToId: string | null;
}

export interface AssignableListing {
  id: string;
  ownerId: string | null;
  assignedToId: string | null;
}

export interface OwnerAssignmentRecord {
  ownerId: string;
  fromMemberId: string | null;
  toMemberId: string | null;
  byId: string;
}

const OWNER_FIELDS = { id: true, assignedToId: true } as const;
const LISTING_FIELDS = { id: true, ownerId: true, assignedToId: true } as const;

/**
 * The writes behind "an owner and its listing always have the same member". Live rows only;
 * everything runs on the caller's transaction.
 */
@Injectable()
export class AssignmentRepository {
  liveOwners(tx: Tx, ids: string[]): Promise<AssignableOwner[]> {
    if (ids.length === 0) return Promise.resolve([]);
    return tx.owner.findMany({
      where: { id: { in: ids }, deletedAt: null },
      select: OWNER_FIELDS,
    });
  }

  liveListings(tx: Tx, ids: string[]): Promise<AssignableListing[]> {
    if (ids.length === 0) return Promise.resolve([]);
    return tx.listing.findMany({
      where: { id: { in: ids }, deletedAt: null },
      select: LISTING_FIELDS,
    });
  }

  /** Live listings linked to these owners (at most one each). */
  liveListingsOfOwners(
    tx: Tx,
    ownerIds: string[],
  ): Promise<AssignableListing[]> {
    if (ownerIds.length === 0) return Promise.resolve([]);
    return tx.listing.findMany({
      where: { ownerId: { in: ownerIds }, deletedAt: null },
      select: LISTING_FIELDS,
    });
  }

  async setOwnersAssignee(
    tx: Tx,
    ids: string[],
    memberId: string | null,
  ): Promise<void> {
    if (ids.length === 0) return;
    await tx.owner.updateMany({
      where: { id: { in: ids }, deletedAt: null },
      data: { assignedToId: memberId },
    });
  }

  async setListingsAssignee(
    tx: Tx,
    ids: string[],
    memberId: string | null,
  ): Promise<void> {
    if (ids.length === 0) return;
    await tx.listing.updateMany({
      where: { id: { in: ids }, deletedAt: null },
      data: { assignedToId: memberId },
    });
  }

  async recordOwnerAssignments(
    tx: Tx,
    rows: OwnerAssignmentRecord[],
  ): Promise<void> {
    if (rows.length === 0) return;
    await tx.ownerAssignment.createMany({ data: rows });
  }
}
