import { ForbiddenException, Injectable } from '@nestjs/common';
import { ErrorCode, type Reminder } from '@prime-crm/shared';
import type { Prisma } from '@prisma/client';
import type { Paginated } from '../../common/interfaces/api-response.interface';
import type { CurrentUser } from '../../common/interfaces/current-user.interface';
import type { Tx } from '../../common/interfaces/transaction.interface';
import { Clock } from '../../common/providers/clock';
import { LIVE } from '../../common/repositories/soft-delete.repository';
import { pageWindow, toPage } from '../../common/utils/pagination.util';
import { hasPermission } from '../../common/utils/permissions.util';
import type { ReminderQueryDto } from './dto/reminder-query.dto';
import { toReminder } from './reminder.shape';
import {
  ReminderRepository,
  type ReminderTargets,
} from './repositories/reminder.repository';

/** A reminder whose owner or listing is still live (not in the trash). */
const ON_LIVE_RECORD: Prisma.ReminderWhereInput = {
  OR: [{ owner: LIVE }, { listing: LIVE }],
};

/**
 * Reminders. Reminders follow their owner or listing: `moveOpenReminders` is how an assignment
 * carries them (to a member, or to nobody), `closeOpenReminders` how a delete ends them.
 */
@Injectable()
export class RemindersService {
  constructor(
    private readonly reminders: ReminderRepository,
    private readonly clock: Clock,
  ) {}

  /**
   * `unassigned=true` (owners.assign): open reminders that belong to nobody, i.e. of unassigned
   * owners and listings. Otherwise the caller's own reminders. Earliest due first.
   */
  async list(
    query: ReminderQueryDto,
    user: CurrentUser,
  ): Promise<Paginated<Reminder>> {
    if (query.unassigned && !hasPermission(user, 'owners.assign')) {
      throw new ForbiddenException({
        message: 'Listing unassigned reminders needs owners.assign',
        error: ErrorCode.FORBIDDEN,
      });
    }
    const where: Prisma.ReminderWhereInput = query.unassigned
      ? { memberId: null, doneAt: null, ...ON_LIVE_RECORD }
      : { memberId: user.id, ...ON_LIVE_RECORD };

    const window = pageWindow(query.page, query.limit);
    const now = this.clock.now();
    const { rows, total } = await this.reminders.findPage(
      where,
      window.skip,
      window.take,
    );
    return toPage(
      rows.map((row) => toReminder(row, now)),
      total,
      window,
    );
  }

  /**
   * Moves every open reminder of these owners/listings to `toMemberId` (`null` = unassigned:
   * they wait there and follow the record to its next member). Done reminders keep their member.
   * Call inside the assignment's transaction.
   */
  moveOpenReminders(
    tx: Tx,
    targets: ReminderTargets,
    toMemberId: string | null,
  ): Promise<number> {
    return this.reminders.moveOpen(tx, targets, toMemberId);
  }

  /** Closes the open reminders of deleted owners/listings (business doc: Reminder). */
  closeOpenReminders(tx: Tx, targets: ReminderTargets): Promise<number> {
    return this.reminders.closeOpen(tx, targets, this.clock.now());
  }

  /** Reminders by id, shaped (for timelines). */
  async byIds(ids: string[], tx?: Tx): Promise<Reminder[]> {
    const now = this.clock.now();
    return (await this.reminders.findByIds(ids, tx)).map((row) =>
      toReminder(row, now),
    );
  }
}
