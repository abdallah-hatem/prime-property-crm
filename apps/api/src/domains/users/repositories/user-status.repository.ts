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
