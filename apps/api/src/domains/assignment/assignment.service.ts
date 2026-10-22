import { BadRequestException, Injectable } from '@nestjs/common';
import { OwnerErrorCode } from '@prime-crm/shared';
import type { Tx } from '../../common/interfaces/transaction.interface';
import type { UserSummary } from '../../common/interfaces/user-summary.interface';
import { UserDirectoryRepository } from '../../common/repositories/user-directory.repository';
import { RemindersService } from '../reminders/reminders.service';
import { planAssignment } from './assignment.pure';
import { AssignmentRepository } from './repositories/assignment.repository';

/** Which records a reassignment starts from; each pulls in its partner (owner and listing). */
export interface AssignmentTargets {
  ownerIds?: string[];
  listingIds?: string[];
}

/** What a reassignment moved: live records only (deleted ids are skipped). */
export interface AssignmentResult {
  ownerIds: string[];
  listingIds: string[];
  remindersMoved: number;
}

/**
 * Assigning work: the owners.assign endpoints (owners, listings) and the deactivation hand-over
 * all go through `reassignOwnerAndListing`, so an owner and its listing always share a member
 * and their open reminders follow them.
 */
@Injectable()
export class AssignmentService {
  constructor(
    private readonly assignments: AssignmentRepository,
    private readonly users: UserDirectoryRepository,
    private readonly reminders: RemindersService,
  ) {}

  /**
   * The assignee must exist and be active (`null` = unassigned is always fine); otherwise
   * 400 INVALID_ASSIGNEE. Returns the assignee's summary.
   */
  async assertAssignee(
    tx: Tx | undefined,
    memberId: string | null,
  ): Promise<UserSummary | null> {
    if (memberId === null) return null;
    const user = await this.users.findActive(memberId, tx);
    if (!user) {
      throw new BadRequestException({
        message: 'The assignee must be an active user',
        error: OwnerErrorCode.INVALID_ASSIGNEE,
      });
    }
    return user;
  }

  /**
   * Gives the owners and listings, and each one's partner (an owner's live listing, a
   * listing's linked owner), to `toMemberId` (`null` = unassigned). Their open reminders move
   * with them; done reminders and calls keep their member. One OwnerAssignment row is written
   * per owner whose member changed. Deleted or unknown ids are skipped.
   *
   * Validate the assignee first (`assertAssignee`); the caller writes its batch's activity entry.
   */
  async reassignOwnerAndListing(
    tx: Tx,
    targets: AssignmentTargets,
    toMemberId: string | null,
    byId: string,
  ): Promise<AssignmentResult> {
    const askedOwners = await this.assignments.liveOwners(tx, [
      ...new Set(targets.ownerIds ?? []),
    ]);
    const askedListings = await this.assignments.liveListings(tx, [
      ...new Set(targets.listingIds ?? []),
    ]);
    const linkedOwners = await this.assignments.liveOwners(
      tx,
      askedListings
        .map((l) => l.ownerId)
        .filter((id): id is string => id !== null),
    );
    const linkedListings = await this.assignments.liveListingsOfOwners(
      tx,
      askedOwners.map((o) => o.id),
    );

    const plan = planAssignment(
      [...askedOwners, ...linkedOwners],
      [...askedListings, ...linkedListings],
      toMemberId,
    );

    await this.assignments.setOwnersAssignee(tx, plan.ownerIds, toMemberId);
    await this.assignments.setListingsAssignee(tx, plan.listingIds, toMemberId);
    await this.assignments.recordOwnerAssignments(
      tx,
      plan.changedOwners.map((o) => ({
        ownerId: o.id,
        fromMemberId: o.assignedToId,
        toMemberId,
        byId,
      })),
    );
    const remindersMoved = await this.reminders.moveOpenReminders(
      tx,
      { ownerIds: plan.ownerIds, listingIds: plan.listingIds },
      toMemberId,
    );

    return {
      ownerIds: plan.ownerIds,
      listingIds: plan.listingIds,
      remindersMoved,
    };
  }
}
