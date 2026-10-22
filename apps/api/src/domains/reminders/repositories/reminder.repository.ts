import { Injectable } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import type { Tx } from '../../../common/interfaces/transaction.interface';
import { DatabaseService } from '../../../database/database.service';
import { REMINDER_SELECT, type ReminderRow } from '../reminder.shape';

/** The records a reminder can hang on, in bulk: every owner and listing listed here. */
export interface ReminderTargets {
  ownerIds?: string[];
  listingIds?: string[];
}

/** Open reminders of these owners and listings (none when both lists are empty). */
function openOf(targets: ReminderTargets): Prisma.ReminderWhereInput | null {
  const or: Prisma.ReminderWhereInput[] = [];
  if (targets.ownerIds?.length) or.push({ ownerId: { in: targets.ownerIds } });
  if (targets.listingIds?.length) {
    or.push({ listingId: { in: targets.listingIds } });
  }
  return or.length ? { doneAt: null, OR: or } : null;
}

/**
 * Reminder reads and the bulk writes other domains trigger (moving with an assignment,
 * closing on delete). The calls/reminders task adds create, edit and done here.
 */
@Injectable()
export class ReminderRepository {
  constructor(private readonly db: DatabaseService) {}

  /** A page ordered by due time (earliest first), ties by id. */
  async findPage(
    where: Prisma.ReminderWhereInput,
    skip: number,
    take: number,
    tx?: Tx,
  ): Promise<{ rows: ReminderRow[]; total: number }> {
    const client = tx ?? this.db;
    const [rows, total] = await Promise.all([
      client.reminder.findMany({
        where,
        select: REMINDER_SELECT,
        orderBy: [{ dueAt: 'asc' }, { id: 'asc' }],
        skip,
        take,
      }),
      client.reminder.count({ where }),
    ]);
    return { rows, total };
  }

  findByIds(ids: string[], tx?: Tx): Promise<ReminderRow[]> {
    if (ids.length === 0) return Promise.resolve([]);
    return (tx ?? this.db).reminder.findMany({
      where: { id: { in: ids } },
      select: REMINDER_SELECT,
    });
  }

  /** Gives every open reminder of the targets to `memberId` (null = unassigned). */
  async moveOpen(
    tx: Tx,
    targets: ReminderTargets,
    memberId: string | null,
  ): Promise<number> {
    const where = openOf(targets);
    if (!where) return 0;
    const { count } = await tx.reminder.updateMany({
      where,
      data: { memberId },
    });
    return count;
  }

  /** Closes (marks done at `at`) every open reminder of the targets. */
  async closeOpen(tx: Tx, targets: ReminderTargets, at: Date): Promise<number> {
    const where = openOf(targets);
    if (!where) return 0;
    const { count } = await tx.reminder.updateMany({
      where,
      data: { doneAt: at },
    });
    return count;
  }
}
