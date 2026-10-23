import {
  BadRequestException,
  ConflictException,
  Injectable,
} from '@nestjs/common';
import { CallErrorCode, ErrorCode, toE164, type Call } from '@prime-crm/shared';
import type { Prisma } from '@prisma/client';
import type { Paginated } from '../../common/interfaces/api-response.interface';
import type { CurrentUser } from '../../common/interfaces/current-user.interface';
import type { Tx } from '../../common/interfaces/transaction.interface';
import { Clock } from '../../common/providers/clock';
import { UserDirectoryRepository } from '../../common/repositories/user-directory.repository';
import { cairoToday, filterBounds } from '../../common/utils/cairo-date.util';
import { assertFound } from '../../common/utils/ownership.util';
import { pageWindow, toPage } from '../../common/utils/pagination.util';
import { hasPermission } from '../../common/utils/permissions.util';
import { isUniqueViolation } from '../../common/utils/prisma-error.util';
import { DatabaseService } from '../../database/database.service';
import { CallOutcomesService } from '../call-outcomes/call-outcomes.service';
import { RemindersService } from '../reminders/reminders.service';
import { toCall } from './call.shape';
import { callRefusal, statusAfterOutcome } from './calls.pure';
import type { CallQueryDto } from './dto/call-query.dto';
import type { SetOutcomeDto } from './dto/set-outcome.dto';
import type { StartCallDto } from './dto/start-call.dto';
import { CallRepository } from './repositories/call.repository';

/**
 * Calls. A member calls only owners assigned to them; the call keeps the owner's name and the
 * number dialled, and moves the owner's last call time (the calling-list order). The outcome is
 * set once, by the call's member; it sets the lead status unless a newer call already has an
 * outcome. Calls are never edited or deleted.
 */
@Injectable()
export class CallsService {
  constructor(
    private readonly db: DatabaseService,
    private readonly calls: CallRepository,
    private readonly outcomes: CallOutcomesService,
    private readonly reminders: RemindersService,
    private readonly users: UserDirectoryRepository,
    private readonly clock: Clock,
  ) {}

  private async shaped(id: string, userId: string, tx?: Tx): Promise<Call> {
    // Sequential: a transaction runs on one connection.
    const row = assertFound(await this.calls.findShaped(id, tx), 'Call');
    return toCall(row, await this.users.languageOf(userId, tx));
  }

  // ------------------------------------------------------------------ start

  /**
   * Starts a call on one of the caller's owners. The same `clientRequestId` from the same
   * member returns the call it already created (a double tap makes one call).
   */
  async start(
    ownerId: string,
    dto: StartCallDto,
    user: CurrentUser,
  ): Promise<Call> {
    try {
      return await this.db.transaction((tx) =>
        this.startIn(tx, ownerId, dto, user),
      );
    } catch (error) {
      // Two taps raced past the pre-check: the loser returns the winner's call.
      if (isUniqueViolation(error)) {
        const existing = await this.calls.findByRequest(
          user.id,
          dto.clientRequestId,
        );
        if (existing) return this.repeat(existing, ownerId, user.id);
      }
      throw error;
    }
  }

  private async repeat(
    existing: { id: string; ownerId: string | null },
    ownerId: string,
    userId: string,
    tx?: Tx,
  ): Promise<Call> {
    if (existing.ownerId !== ownerId) {
      throw new ConflictException({
        message: 'This request id was already used for another call',
        error: CallErrorCode.REQUEST_ID_REUSED,
      });
    }
    return this.shaped(existing.id, userId, tx);
  }

  private async startIn(
    tx: Tx,
    ownerId: string,
    dto: StartCallDto,
    user: CurrentUser,
  ): Promise<Call> {
    const owner = assertFound(
      await this.calls.findTarget(tx, ownerId, user.id),
      'Owner',
    );
    const existing = await this.calls.findByRequest(
      user.id,
      dto.clientRequestId,
      tx,
    );
    if (existing) return this.repeat(existing, ownerId, user.id, tx);

    const refusal = callRefusal(owner.status);
    if (refusal === 'DO_NOT_CALL') {
      throw new ConflictException({
        message: 'This owner asked not to be called',
        error: CallErrorCode.DO_NOT_CALL,
      });
    }
    if (refusal === 'OWNER_LISTED') {
      throw new ConflictException({
        message: 'This owner is listed: follow it up through its listing',
        error: CallErrorCode.OWNER_LISTED,
      });
    }

    const phone = toE164(dto.phone);
    if (!phone || !owner.phones.some((p) => p.phone === phone)) {
      throw new BadRequestException({
        message: "The phone is not one of this owner's numbers",
        error: CallErrorCode.PHONE_NOT_OWNERS,
      });
    }

    const now = this.clock.now();
    const row = await this.calls.createShaped(tx, {
      ownerId,
      ownerName: owner.name,
      memberId: user.id,
      phone,
      clientRequestId: dto.clientRequestId,
      startedAt: now,
    });
    await this.calls.touchLastCall(tx, ownerId, now);
    return toCall(row, await this.users.languageOf(user.id, tx));
  }

  // ------------------------------------------------------------------ outcome

  /**
   * Sets the outcome of the caller's call, once. The owner's status follows the outcome's
   * mapping unless a newer call already has an outcome, or the owner is Listed or Do not call.
   * The optional reminder goes on the owner for its member. All of it or nothing.
   */
  async setOutcome(
    id: string,
    dto: SetOutcomeDto,
    user: CurrentUser,
  ): Promise<Call> {
    return this.db.transaction(async (tx) => {
      const call = assertFound(
        await this.calls.findOwn(tx, id, user.id),
        'Call',
      );
      if (call.outcomeId) throw alreadySet();

      const outcome = assertFound(
        await this.outcomes.find(tx, dto.outcomeId),
        'Call outcome',
      );
      if (outcome.hidden) {
        throw new BadRequestException({
          message: 'This outcome is hidden',
          error: CallErrorCode.OUTCOME_HIDDEN,
        });
      }

      const now = this.clock.now();
      const saved = await this.calls.setOutcome(tx, id, {
        outcomeId: outcome.id,
        note: dto.note ?? null,
        outcomeAt: now,
      });
      if (saved === 0) throw alreadySet();

      const owner = call.ownerId
        ? await this.calls.findOwnerState(tx, call.ownerId)
        : null;
      if (call.ownerId && owner) {
        const next = statusAfterOutcome(
          owner.status,
          outcome.setsStatus,
          await this.calls.newerOutcomeExists(tx, call.ownerId, call.startedAt),
        );
        if (next) await this.calls.setOwnerStatus(tx, call.ownerId, next);
      }

      if (dto.reminder) {
        // A trashed or purged owner has nothing to hang the reminder on: 404, nothing saved.
        const target = assertFound(
          call.ownerId && owner ? { id: call.ownerId, ...owner } : null,
          'Owner',
        );
        await this.reminders.addToOwner(tx, {
          ownerId: target.id,
          memberId: target.assignedToId,
          dueAt: dto.reminder.dueAt,
          note: dto.reminder.note,
          createdById: user.id,
        });
      }
      return this.shaped(id, user.id, tx);
    });
  }

  // ------------------------------------------------------------------ reads

  /** Calls newest first. Without analytics.view, the caller's own whatever `memberId` says. */
  async list(query: CallQueryDto, user: CurrentUser): Promise<Paginated<Call>> {
    const { from, to, valid } = filterBounds(query.from, query.to);
    if (!valid) {
      throw new BadRequestException({
        message: '`from` must be before `to`',
        error: ErrorCode.VALIDATION_FAILED,
      });
    }
    const memberId = hasPermission(user, 'analytics.view')
      ? query.memberId
      : user.id;
    const where: Prisma.CallWhereInput = {
      memberId,
      ownerId: query.ownerId,
      outcomeId: query.outcomeId,
      startedAt: from || to ? { gte: from, lt: to } : undefined,
    };
    if (query.missingOutcome !== undefined) {
      where.outcomeId = query.missingOutcome
        ? null
        : (query.outcomeId ?? { not: null });
    }

    const window = pageWindow(query.page, query.limit);
    const [{ rows, total }, language] = await Promise.all([
      this.calls.findPage(where, window.skip, window.take),
      this.users.languageOf(user.id),
    ]);
    return toPage(
      rows.map((row) => toCall(row, language)),
      total,
      window,
    );
  }

  /**
   * For the today screen: the caller's calls still missing an outcome (up to `take`), how many
   * there are in all, and today's count.
   */
  async today(
    userId: string,
    take: number,
  ): Promise<{
    outcomeMissing: Call[];
    outcomeMissingTotal: number;
    callsToday: number;
  }> {
    const today = cairoToday(this.clock.now());
    const [{ rows, total }, callsToday, language] = await Promise.all([
      this.calls.findPage({ memberId: userId, outcomeId: null }, 0, take),
      this.calls.count({
        memberId: userId,
        startedAt: { gte: today.start, lt: today.end },
      }),
      this.users.languageOf(userId),
    ]);
    return {
      outcomeMissing: rows.map((row) => toCall(row, language)),
      outcomeMissingTotal: total,
      callsToday,
    };
  }
}

function alreadySet(): ConflictException {
  return new ConflictException({
    message: 'This call already has its outcome',
    error: CallErrorCode.OUTCOME_ALREADY_SET,
  });
}
