import { BadRequestException, Injectable } from '@nestjs/common';
import {
  UserStatusErrorCode,
  type HandOverCounts,
  type User,
} from '@prime-crm/shared';
import type { Tx } from '../../common/interfaces/transaction.interface';
import type { UserSummary } from '../../common/interfaces/user-summary.interface';
import { Clock } from '../../common/providers/clock';
import { UserDirectoryRepository } from '../../common/repositories/user-directory.repository';
import { assertFound } from '../../common/utils/ownership.util';
import { toUser } from '../../common/utils/user-shape.util';
import { DatabaseService } from '../../database/database.service';
import { ActivityService } from '../activity/activity.service';
import { AssignmentService } from '../assignment/assignment.service';
import { SessionService } from '../auth/session.service';
import { LastAdminService } from './last-admin.service';
import { UserStatusRepository } from './repositories/user-status.repository';
import { UserRepository } from './repositories/user.repository';

const USER = 'USER';

/**
 * Deactivation with hand-over (business doc, flow 8) and reactivation (flow 11). Kept apart from
 * UsersService because it moves work around: it goes through AssignmentService so an owner and
 * its listing keep sharing a member and their open reminders follow them.
 */
@Injectable()
export class UserStatusService {
  constructor(
    private readonly db: DatabaseService,
    private readonly users: UserRepository,
    private readonly status: UserStatusRepository,
    private readonly directory: UserDirectoryRepository,
    private readonly lastAdmin: LastAdminService,
    private readonly assignment: AssignmentService,
    private readonly sessions: SessionService,
    private readonly activity: ActivityService,
    private readonly clock: Clock,
  ) {}

  /**
   * One transaction: the user's row lock (see `UserStatusRepository.lockUser`), the last-admin check (it takes the Admin role lock first, so concurrent
   * deactivations run one after the other), the recipient check, every live owner and listing
   * of the user with their open reminders to `handOverTo` (null = unassigned), all sessions
   * ended, the user inactive, one USER_DEACTIVATE entry with the counts. Calls and done
   * reminders keep their member. An already deactivated user is returned unchanged.
   */
  async deactivate(
    id: string,
    handOverTo: string | null,
    actorId: string,
  ): Promise<User> {
    if (id === actorId) {
      throw new BadRequestException({
        message: "You can't deactivate yourself",
        error: UserStatusErrorCode.SELF_DEACTIVATE,
      });
    }
    if (handOverTo === id) throw this.invalidHandOver();

    return this.db.transaction(async (tx) => {
      // First: an assignment to this user holds the row FOR SHARE until it commits, so after
      // this lock no assignment to them is in flight and none can start (it would see them
      // inactive once this commits).
      await this.status.lockUser(tx, id);
      const user = assertFound(await this.users.findShape(id, tx), 'User');
      await this.lastAdmin.assertNotLastActiveAdmin(tx, id);
      if (!user.active) return toUser(user);
      const recipient = await this.recipient(tx, handOverTo);

      const work = await this.status.assignedWork(tx, id);
      const moved = await this.assignment.reassignOwnerAndListing(
        tx,
        work,
        handOverTo,
        actorId,
      );
      const sessionsEnded = await this.sessions.revokeAllSessions(tx, id);
      const updated = await this.status.setActive(
        tx,
        id,
        false,
        this.clock.now(),
      );

      const counts: HandOverCounts = {
        owners: moved.ownerIds.length,
        listings: moved.listingIds.length,
        reminders: moved.remindersMoved,
      };
      await this.activity.record(tx, {
        type: 'USER_DEACTIVATE',
        actorId,
        summary: `Deactivated ${user.name}; work handed to ${recipient?.name ?? 'nobody (unassigned)'}`,
        target: { kind: USER, id, label: user.name },
        details: { handOverTo: recipient, ...counts, sessionsEnded },
      });
      return toUser(updated);
    });
  }

  /**
   * Lets a deactivated user sign in again. Nothing comes back to them: their old work stays
   * where the hand-over put it. Reactivating an active user changes and logs nothing.
   */
  async reactivate(id: string, actorId: string): Promise<User> {
    return this.db.transaction(async (tx) => {
      const user = assertFound(await this.users.findShape(id, tx), 'User');
      if (user.active) return toUser(user);
      const updated = await this.status.setActive(
        tx,
        id,
        true,
        this.clock.now(),
      );
      await this.activity.record(tx, {
        type: 'USER_REACTIVATE',
        actorId,
        summary: `Reactivated ${user.name}`,
        target: { kind: USER, id, label: user.name },
      });
      return toUser(updated);
    });
  }

  /** The hand-over recipient: null for unassigned, else an active user (400 otherwise). */
  private async recipient(
    tx: Tx,
    handOverTo: string | null,
  ): Promise<UserSummary | null> {
    if (handOverTo === null) return null;
    const user = await this.directory.findActive(handOverTo, tx);
    if (!user) throw this.invalidHandOver();
    return user;
  }

  private invalidHandOver(): BadRequestException {
    return new BadRequestException({
      message: 'Hand the work over to another active user, or to nobody',
      error: UserStatusErrorCode.INVALID_HANDOVER,
    });
  }
}
