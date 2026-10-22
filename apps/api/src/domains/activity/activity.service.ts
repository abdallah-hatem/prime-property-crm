import { BadRequestException, Injectable } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { ErrorCode } from '@prime-crm/shared';
import type { Paginated } from '../../common/interfaces/api-response.interface';
import type { Tx } from '../../common/interfaces/transaction.interface';
import { ActivityEntryRepository } from '../../common/repositories/activity-entry.repository';
import { filterBounds } from '../../common/utils/cairo-date.util';
import { toActivityEntry } from './activity.pure';
import type { ActivityQueryDto } from './dto/activity-query.dto';
import type {
  ActivityEntryView,
  ActivityRecordInput,
} from './interfaces/activity.interface';

/**
 * The activity log. Every domain records through `record(tx, entry)` inside the transaction of
 * the change it describes, so the entry commits or rolls back with it.
 */
@Injectable()
export class ActivityService {
  constructor(private readonly entries: ActivityEntryRepository) {}

  async record(tx: Tx, entry: ActivityRecordInput): Promise<void> {
    await this.entries.create(
      {
        type: entry.type,
        actorId: entry.actorId,
        summary: entry.summary,
        targetKind: entry.target?.kind ?? null,
        targetId: entry.target?.id ?? null,
        targetLabel: entry.target?.label ?? null,
        details: (entry.details ?? undefined) as
          Prisma.InputJsonValue | undefined,
      },
      tx,
    );
  }

  /** True when the log has an entry of `type` about this target (read inside `tx`). */
  hasEntryFor(
    tx: Tx,
    type: ActivityRecordInput['type'],
    targetKind: string,
    targetId: string,
  ): Promise<boolean> {
    return this.entries.existsFor(type, targetKind, targetId, tx);
  }

  async list(query: ActivityQueryDto): Promise<Paginated<ActivityEntryView>> {
    const { from, to, valid } = filterBounds(query.from, query.to);
    if (!valid) {
      throw new BadRequestException({
        message: '`from` must be before `to`',
        error: ErrorCode.VALIDATION_FAILED,
      });
    }

    const page = await this.entries.findPage(
      { types: query.type, actorId: query.actorId, from, to },
      query.page,
      query.limit,
    );
    return { ...page, data: page.data.map(toActivityEntry) };
  }
}
