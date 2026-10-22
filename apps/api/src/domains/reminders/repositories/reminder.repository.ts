import { Injectable } from '@nestjs/common';
import type { Prisma, ReminderKind } from '@prisma/client';
import type { Tx } from '../../../common/interfaces/transaction.interface';
import { DatabaseService } from '../../../database/database.service';
import { REMINDER_SELECT, type ReminderRow } from '../reminder.shape';
import { REMINDER_LIST_ORDER } from '../reminders.pure';

/** The records a reminder can hang on, in bulk: every owner and listing listed here. */
export interface ReminderTargets {
  ownerIds?: string[];
  listingIds?: string[];
}

/** Open reminders of these owners and listings (none when both lists are empty). */
function openOf(
  targets: ReminderTargets,
  kinds?: ReminderKind[],
): Prisma.ReminderWhereInput | null {
  const or: Prisma.ReminderWhereInput[] = [];
  if (targets.ownerIds?.length) or.push({ ownerId: { in: targets.ownerIds } });
  if (targets.listingIds?.length) {
    or.push({ listingId: { in: targets.listingIds } });
  }
  if (!or.length) return null;
  return kinds
    ? { doneAt: null, kind: { in: kinds }, OR: or }
    : { doneAt: null, OR: or };
}

/**
 * Reminder reads and writes: the bulk ones other domains trigger (moving with an assignment,
 * closing on delete) and create, edit and done.
 */
@Injectable()
export class ReminderRepository {
  constructor(private readonly db: DatabaseService) {}

  /** A page: open first by due time (overdue on top), then done ones (REMINDER_LIST_ORDER). */
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
        orderBy: REMINDER_LIST_ORDER,
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

  /** Closes (marks done at `at`) every open reminder of the targets (of `kinds` only, if given). */
  async closeOpen(
    tx: Tx,
    targets: ReminderTargets,
    at: Date,
    kinds?: ReminderKind[],
  ): Promise<number> {
    const where = openOf(targets, kinds);
    if (!where) return 0;
    const { count } = await tx.reminder.updateMany({
      where,
      data: { doneAt: at },
    });
    return count;
  }

  /** Up to `take` reminders, earliest due first (the today lists). */
  findFirst(
    where: Prisma.ReminderWhereInput,
    take: number,
  ): Promise<ReminderRow[]> {
    return this.db.reminder.findMany({
      where,
      select: REMINDER_SELECT,
      orderBy: [{ dueAt: 'asc' }, { id: 'asc' }],
      take,
    });
  }

  count(where: Prisma.ReminderWhereInput): Promise<number> {
    return this.db.reminder.count({ where });
  }

  /** One reminder matching `where` (id plus scope), with what the edit rules need. */
  findOne(
    where: Prisma.ReminderWhereInput,
    tx?: Tx,
  ): Promise<ReminderRow | null> {
    return (tx ?? this.db).reminder.findFirst({
      where,
      select: REMINDER_SELECT,
    });
  }

  /** The member of a live owner, when `memberId` holds it; null when not theirs or gone. */
  ownerOf(
    tx: Tx,
    ownerId: string,
    memberId: string,
  ): Promise<{ id: string } | null> {
    return tx.owner.findFirst({
      where: { id: ownerId, assignedToId: memberId, deletedAt: null },
      select: { id: true },
    });
  }

  /** The same for a live listing. */
  listingOf(
    tx: Tx,
    listingId: string,
    memberId: string,
  ): Promise<{ id: string } | null> {
    return tx.listing.findFirst({
      where: { id: listingId, assignedToId: memberId, deletedAt: null },
      select: { id: true },
    });
  }

  create(
    tx: Tx,
    data: Prisma.ReminderUncheckedCreateInput,
  ): Promise<ReminderRow> {
    return tx.reminder.create({ data, select: REMINDER_SELECT });
  }

  /** Edits an open reminder; 0 when it was done meanwhile. */
  async updateOpen(
    tx: Tx,
    id: string,
    data: Prisma.ReminderUncheckedUpdateInput,
  ): Promise<number> {
    const { count } = await tx.reminder.updateMany({
      where: { id, doneAt: null },
      data,
    });
    return count;
  }
}
