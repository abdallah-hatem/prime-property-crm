import { Injectable } from '@nestjs/common';
import type { Tx } from '../../../common/interfaces/transaction.interface';
import {
  USER_SHAPE_SELECT,
  type UserShapeRow,
} from '../../../common/utils/user-shape.util';

/** The live work a user holds, as ids for AssignmentService.reassignOwnerAndListing. */
export interface AssignedWork {
  ownerIds: string[];
  listingIds: string[];
}

/** Deactivate / reactivate reads and writes. Everything runs on the caller's transaction. */
@Injectable()
export class UserStatusRepository {
  /**
   * Locks the user's row until `tx` ends. FOR NO KEY UPDATE conflicts with the FOR SHARE that
   * `UserDirectoryRepository.findActive(id, tx)` takes for an assignment, so an assignment to
   * this user either commits first (and its work is then handed over) or waits and sees the
   * user inactive. Unlike FOR UPDATE it doesn't block foreign-key checks (an activity entry or
   * reminder naming the user), so it adds no deadlock with concurrent writes that only
   * reference the user.
   */
  async lockUser(tx: Tx, id: string): Promise<void> {
    await tx.$queryRaw`SELECT id FROM users WHERE id = ${id}::uuid FOR NO KEY UPDATE`;
  }

  async assignedWork(tx: Tx, userId: string): Promise<AssignedWork> {
    const where = { assignedToId: userId, deletedAt: null };
    const owners = await tx.owner.findMany({ where, select: { id: true } });
    const listings = await tx.listing.findMany({ where, select: { id: true } });
    return {
      ownerIds: owners.map((o) => o.id),
      listingIds: listings.map((l) => l.id),
    };
  }

  /** Sets the active flag; `deactivatedAt` is `at` when deactivating and cleared otherwise. */
  setActive(
    tx: Tx,
    id: string,
    active: boolean,
    at: Date,
  ): Promise<UserShapeRow> {
    return tx.user.update({
      where: { id },
      data: { active, deactivatedAt: active ? null : at },
      select: USER_SHAPE_SELECT,
    });
  }
}
