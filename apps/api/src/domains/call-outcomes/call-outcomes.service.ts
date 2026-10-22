import {
  ConflictException,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import {
  CallOutcomeErrorCode,
  ErrorCode,
  PICKER_LIMIT_MAX,
  type CallOutcome,
} from '@prime-crm/shared';
import type { Paginated } from '../../common/interfaces/api-response.interface';
import type { CurrentUser } from '../../common/interfaces/current-user.interface';
import type { Tx } from '../../common/interfaces/transaction.interface';
import { assertFound } from '../../common/utils/ownership.util';
import { pageWindow, toPage } from '../../common/utils/pagination.util';
import { hasPermission } from '../../common/utils/permissions.util';
import { isForeignKeyViolation } from '../../common/utils/prisma-error.util';
import { DatabaseService } from '../../database/database.service';
import { ActivityService } from '../activity/activity.service';
import { changedFields, toCallOutcome } from './call-outcomes.pure';
import type { CallOutcomeQueryDto } from './dto/call-outcome-query.dto';
import type { CreateCallOutcomeDto } from './dto/create-call-outcome.dto';
import type { UpdateCallOutcomeDto } from './dto/update-call-outcome.dto';
import {
  CallOutcomeRepository,
  type CallOutcomeRow,
} from './repositories/call-outcome.repository';

const TARGET_KIND = 'CALL_OUTCOME';

function inUse(): ConflictException {
  return new ConflictException({
    message: 'This outcome is used by calls: hide it instead',
    error: CallOutcomeErrorCode.OUTCOME_IN_USE,
  });
}

/**
 * Call outcomes: everyone reads the visible list; settings.manage edits it. Every create,
 * edit and delete writes one OUTCOME_UPDATE activity entry; an edit that changes nothing
 * writes none.
 */
@Injectable()
export class CallOutcomesService {
  constructor(
    private readonly db: DatabaseService,
    private readonly outcomes: CallOutcomeRepository,
    private readonly activity: ActivityService,
  ) {}

  async list(
    query: CallOutcomeQueryDto,
    user: CurrentUser,
  ): Promise<Paginated<CallOutcome>> {
    if (query.includeHidden && !hasPermission(user, 'settings.manage')) {
      throw new ForbiddenException({
        message: 'Hidden outcomes need settings.manage',
        error: ErrorCode.FORBIDDEN,
      });
    }
    const window = pageWindow(query.page, query.limit, PICKER_LIMIT_MAX);
    const { rows, total } = await this.outcomes.findPage(
      query.includeHidden ?? false,
      window.skip,
      window.take,
    );
    return toPage(rows.map(toCallOutcome), total, window);
  }

  /** The outcome by id, read inside the caller's transaction (setting a call's outcome). */
  find(tx: Tx, id: string): Promise<CallOutcomeRow | null> {
    return this.outcomes.findById(id, tx);
  }

  async create(
    dto: CreateCallOutcomeDto,
    user: CurrentUser,
  ): Promise<CallOutcome> {
    return this.db.transaction(async (tx) => {
      const row = await this.outcomes.create(tx, {
        labelEn: dto.labelEn,
        labelAr: dto.labelAr,
        setsStatus: dto.setsStatus,
        order: await this.outcomes.nextOrder(tx),
      });
      await this.activity.record(tx, {
        type: 'OUTCOME_UPDATE',
        actorId: user.id,
        summary: `Added call outcome ${row.labelEn}`,
        target: { kind: TARGET_KIND, id: row.id, label: row.labelEn },
        details: { action: 'create', setsStatus: row.setsStatus },
      });
      return toCallOutcome(row);
    });
  }

  async update(
    id: string,
    dto: UpdateCallOutcomeDto,
    user: CurrentUser,
  ): Promise<CallOutcome> {
    return this.db.transaction(async (tx) => {
      const current = assertFound(
        await this.outcomes.findById(id, tx),
        'Call outcome',
      );
      const changed = changedFields(current, dto);
      if (Object.keys(changed).length === 0) return toCallOutcome(current);

      const data = Object.fromEntries(
        Object.entries(changed).map(([field, { to }]) => [field, to]),
      );
      const row = await this.outcomes.update(tx, id, data);
      await this.activity.record(tx, {
        type: 'OUTCOME_UPDATE',
        actorId: user.id,
        summary: `Edited call outcome ${row.labelEn}`,
        target: { kind: TARGET_KIND, id, label: row.labelEn },
        details: { action: 'update', changed },
      });
      return toCallOutcome(row);
    });
  }

  /** Only an outcome no call has ever used can be deleted (409 OUTCOME_IN_USE). */
  async remove(id: string, user: CurrentUser): Promise<void> {
    try {
      await this.db.transaction(async (tx) => {
        const current = assertFound(
          await this.outcomes.findById(id, tx),
          'Call outcome',
        );
        if (!(await this.outcomes.deleteUnused(tx, id))) throw inUse();
        await this.activity.record(tx, {
          type: 'OUTCOME_UPDATE',
          actorId: user.id,
          summary: `Deleted call outcome ${current.labelEn}`,
          target: { kind: TARGET_KIND, id, label: current.labelEn },
          details: { action: 'delete' },
        });
      });
    } catch (error) {
      // A call took the outcome between the check and the delete.
      if (isForeignKeyViolation(error)) throw inUse();
      throw error;
    }
  }
}
