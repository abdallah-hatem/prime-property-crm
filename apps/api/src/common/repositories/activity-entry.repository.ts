import { Injectable } from '@nestjs/common';
import type { ActivityEntry, ActivityType, Prisma } from '@prisma/client';
import { PAGE_LIMIT_MAX } from '@prime-crm/shared';
import { DatabaseService } from '../../database/database.service';
import type { Paginated } from '../interfaces/api-response.interface';
import type { Tx } from '../interfaces/transaction.interface';
import { AppendOnlyRepository } from './append-only.repository';

export interface ActivityFilter {
  types?: ActivityType[];
  actorId?: string;
  /** Inclusive lower bound. */
  from?: Date;
  /** Exclusive upper bound. */
  to?: Date;
}

const ACTIVITY_SELECT = {
  id: true,
  type: true,
  summary: true,
  targetKind: true,
  targetId: true,
  targetLabel: true,
  details: true,
  createdAt: true,
  actor: { select: { id: true, name: true } },
} satisfies Prisma.ActivityEntrySelect;

export type ActivityRow = Prisma.ActivityEntryGetPayload<{
  select: typeof ACTIVITY_SELECT;
}>;

/** The activity log: append and read only (business doc: it cannot be edited or deleted). */
@Injectable()
export class ActivityEntryRepository extends AppendOnlyRepository<
  ActivityEntry,
  Prisma.ActivityEntryUncheckedCreateInput
> {
  constructor(private readonly db: DatabaseService) {
    super(db.activityEntry, (tx) => tx.activityEntry);
  }

  /** Newest first. `limit` is capped at PAGE_LIMIT_MAX like every list. */
  async findPage(
    filter: ActivityFilter,
    page = 1,
    limit = PAGE_LIMIT_MAX,
  ): Promise<Paginated<ActivityRow>> {
    const safePage = Math.max(1, Math.floor(page));
    const safeLimit = Math.min(Math.max(1, Math.floor(limit)), PAGE_LIMIT_MAX);
    const where: Prisma.ActivityEntryWhereInput = {
      ...(filter.types?.length ? { type: { in: filter.types } } : {}),
      ...(filter.actorId ? { actorId: filter.actorId } : {}),
      ...(filter.from || filter.to
        ? {
            createdAt: {
              ...(filter.from ? { gte: filter.from } : {}),
              ...(filter.to ? { lt: filter.to } : {}),
            },
          }
        : {}),
    };

    const [data, total] = await Promise.all([
      this.db.activityEntry.findMany({
        where,
        select: ACTIVITY_SELECT,
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        skip: (safePage - 1) * safeLimit,
        take: safeLimit,
      }),
      this.db.activityEntry.count({ where }),
    ]);

    return {
      data,
      total,
      page: safePage,
      limit: safeLimit,
      hasNextPage: safePage * safeLimit < total,
      hasPreviousPage: safePage > 1,
    };
  }

  /**
   * True when the log holds an entry of `type` for this target (e.g. a DELETE of a purged row).
   * Inside a transaction pass its `tx`: on Vercel the pool has one connection, and a read
   * through the app client would wait on the connection the transaction holds.
   */
  async existsFor(
    type: ActivityType,
    targetKind: string,
    targetId: string,
    tx?: Tx,
  ): Promise<boolean> {
    const entry = await (tx ?? this.db).activityEntry.findFirst({
      where: { type, targetKind, targetId },
      select: { id: true },
    });
    return entry !== null;
  }
}
