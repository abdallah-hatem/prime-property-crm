import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import {
  ErrorCode,
  ReminderErrorCode,
  TODAY_LIST_MAX,
  type Language,
  type Reminder,
  type ReminderKind,
} from '@prime-crm/shared';
import type { Prisma } from '@prisma/client';
import type { Paginated } from '../../common/interfaces/api-response.interface';
import type { CurrentUser } from '../../common/interfaces/current-user.interface';
import type { Tx } from '../../common/interfaces/transaction.interface';
import { Clock } from '../../common/providers/clock';
import { UserDirectoryRepository } from '../../common/repositories/user-directory.repository';
import { LIVE } from '../../common/repositories/soft-delete.repository';
import { cairoToday } from '../../common/utils/cairo-date.util';
import {
  assertFound,
  notFound,
  ownerScope,
} from '../../common/utils/ownership.util';
import { pageWindow, toPage } from '../../common/utils/pagination.util';
import { hasPermission } from '../../common/utils/permissions.util';
import { DatabaseService } from '../../database/database.service';
import type { CreateReminderDto } from './dto/create-reminder.dto';
import type { ReminderQueryDto } from './dto/reminder-query.dto';
import type { UpdateReminderDto } from './dto/update-reminder.dto';
import { toReminder, type ReminderRow } from './reminder.shape';
import {
  editRefusal,
  isInPast,
  isSystemKind,
  stateWhere,
  whenWhere,
} from './reminders.pure';
import {
  ReminderRepository,
  type ReminderTargets,
} from './repositories/reminder.repository';

/** A reminder whose owner or listing is still live (not in the trash). */
const ON_LIVE_RECORD: Prisma.ReminderWhereInput = {
  OR: [{ owner: LIVE }, { listing: LIVE }],
};

function inPast(): BadRequestException {
  return new BadRequestException({
    message: 'A reminder must be due in the future',
    error: ReminderErrorCode.REMINDER_IN_PAST,
  });
}

function systemReminder(message: string): BadRequestException {
  return new BadRequestException({
    message,
    error: ReminderErrorCode.SYSTEM_REMINDER,
  });
}

function reminderDone(): ConflictException {
  return new ConflictException({
    message: 'This reminder is already done',
    error: ReminderErrorCode.REMINDER_DONE,
  });
}

/** What `GET /me/today` shows of the caller's reminders: capped lists and true totals. */
export interface TodayReminders {
  overdue: Reminder[];
  dueToday: Reminder[];
  adTasks: Reminder[];
  counts: {
    overdue: number;
    dueToday: number;
    adTasks: number;
    remindersOpen: number;
  };
}

/** A manual reminder on an owner, added inside the caller's transaction (a call outcome). */
export interface OwnerReminderInput {
  ownerId: string;
  /** The owner's member (null while it is unassigned). */
  memberId: string | null;
  dueAt: string;
  note?: string;
  createdById: string;
}

/**
 * Reminders. Every reminder belongs to its owner's or listing's member (or to nobody while the
 * record is unassigned) and only that member edits or closes it; anything else is a 404.
 * Reminders follow their record: `moveOpenReminders` is how an assignment carries them,
 * `closeOpenReminders` how a delete ends them.
 */
@Injectable()
export class RemindersService {
  constructor(
    private readonly db: DatabaseService,
    private readonly reminders: ReminderRepository,
    private readonly users: UserDirectoryRepository,
    private readonly clock: Clock,
  ) {}

  /** Shapes rows for `userId`: listing titles in their language. */
  private async shapeFor(
    userId: string,
    rows: ReminderRow[],
    tx?: Tx,
  ): Promise<Reminder[]> {
    const language = await this.users.languageOf(userId, tx);
    const now = this.clock.now();
    return rows.map((row) => toReminder(row, now, language));
  }

  /**
   * The filters for `ownerId` / `listingId`: every reminder on that record, whoever's it is,
   * when the caller may see the record's reminders (owner: theirs or owners.viewAll; listing:
   * theirs or listings.manageAll); 404 otherwise, as for a missing or trashed record.
   */
  private async targetWhere(
    query: ReminderQueryDto,
    user: CurrentUser,
  ): Promise<Prisma.ReminderWhereInput[]> {
    const and: Prisma.ReminderWhereInput[] = [];
    if (query.ownerId) {
      const owner = await this.reminders.findLiveOwner(
        query.ownerId,
        ownerScope(user, 'assignedToId', { bypass: 'owners.viewAll' }),
      );
      if (!owner) throw notFound('Owner');
      and.push({ ownerId: query.ownerId });
    }
    if (query.listingId) {
      const listing = await this.reminders.findLiveListing(
        query.listingId,
        ownerScope(user, 'assignedToId', { bypass: 'listings.manageAll' }),
      );
      if (!listing) throw notFound('Listing');
      and.push({ listingId: query.listingId });
    }
    return and;
  }

  // ------------------------------------------------------------------ lists

  /**
   * The caller's reminders, or another member's (`memberId`, analytics.view), or the
   * unassigned ones (`unassigned`, owners.assign), or every reminder of one owner (`ownerId`)
   * or listing (`listingId`) the caller may see. Open first, overdue on top.
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
    if (
      query.memberId &&
      query.memberId !== user.id &&
      !hasPermission(user, 'analytics.view')
    ) {
      throw new ForbiddenException({
        message: "Another member's reminders need analytics.view",
        error: ErrorCode.FORBIDDEN,
      });
    }
    if (query.unassigned && query.memberId) {
      throw new BadRequestException({
        message: 'Use either unassigned or memberId',
        error: ErrorCode.VALIDATION_FAILED,
      });
    }

    const now = this.clock.now();
    const target = await this.targetWhere(query, user);
    const and: Prisma.ReminderWhereInput[] = [ON_LIVE_RECORD, ...target];
    if (query.unassigned) {
      and.push({ memberId: null, doneAt: null });
    } else if (query.memberId || !target.length) {
      and.push({ memberId: query.memberId ?? user.id });
    }
    if (query.state) and.push(stateWhere(query.state));
    if (query.when) and.push(whenWhere(query.when, now, cairoToday(now).end));
    if (query.kind) and.push({ kind: query.kind });

    const window = pageWindow(query.page, query.limit);
    const { rows, total } = await this.reminders.findPage(
      { AND: and },
      window.skip,
      window.take,
    );
    return toPage(await this.shapeFor(user.id, rows), total, window);
  }

  /**
   * The caller's open reminders for the today screen: manual ones overdue and due later today
   * (Cairo), the ad tasks (every take-down task, check-ins due by the end of today), each list
   * capped at TODAY_LIST_MAX, and the true total of each list and of every open reminder.
   */
  async today(userId: string): Promise<TodayReminders> {
    const now = this.clock.now();
    const endOfToday = cairoToday(now).end;
    const open: Prisma.ReminderWhereInput = {
      memberId: userId,
      doneAt: null,
      ...ON_LIVE_RECORD,
    };
    const overdueWhere: Prisma.ReminderWhereInput = {
      ...open,
      kind: 'MANUAL',
      dueAt: { lt: now },
    };
    const dueTodayWhere: Prisma.ReminderWhereInput = {
      ...open,
      kind: 'MANUAL',
      dueAt: { gte: now, lt: endOfToday },
    };
    const adTasksWhere: Prisma.ReminderWhereInput = {
      AND: [
        open,
        {
          OR: [
            { kind: 'AD_TAKE_DOWN' },
            { kind: 'AD_CHECK_IN', dueAt: { lt: endOfToday } },
          ],
        },
      ],
    };
    const [overdue, dueToday, adTasks, counts, language] = await Promise.all([
      this.reminders.findFirst(overdueWhere, TODAY_LIST_MAX),
      this.reminders.findFirst(dueTodayWhere, TODAY_LIST_MAX),
      this.reminders.findFirst(adTasksWhere, TODAY_LIST_MAX),
      Promise.all([
        this.reminders.count(overdueWhere),
        this.reminders.count(dueTodayWhere),
        this.reminders.count(adTasksWhere),
        this.reminders.count(open),
      ]),
      this.users.languageOf(userId),
    ]);
    const shape = (rows: ReminderRow[]) =>
      rows.map((row) => toReminder(row, now, language));
    return {
      overdue: shape(overdue),
      dueToday: shape(dueToday),
      adTasks: shape(adTasks),
      counts: {
        overdue: counts[0],
        dueToday: counts[1],
        adTasks: counts[2],
        remindersOpen: counts[3],
      },
    };
  }

  /** Reminders by id, shaped for `language` (for timelines). */
  async byIds(ids: string[], language: Language, tx?: Tx): Promise<Reminder[]> {
    const now = this.clock.now();
    return (await this.reminders.findByIds(ids, tx)).map((row) =>
      toReminder(row, now, language),
    );
  }

  // ------------------------------------------------------------------ writes

  private assertFuture(dueAt: string): Date {
    const due = new Date(dueAt);
    if (isInPast(due, this.clock.now())) throw inPast();
    return due;
  }

  /** A MANUAL reminder on one of the caller's owners or listings (404 for anything else). */
  async create(dto: CreateReminderDto, user: CurrentUser): Promise<Reminder> {
    return this.db.transaction(async (tx) => {
      const target = dto.ownerId
        ? await this.reminders.ownerOf(tx, dto.ownerId, user.id)
        : await this.reminders.listingOf(tx, dto.listingId as string, user.id);
      assertFound(target, dto.ownerId ? 'Owner' : 'Listing');
      const dueAt = this.assertFuture(dto.dueAt);

      const row = await this.reminders.create(tx, {
        kind: 'MANUAL',
        ownerId: dto.ownerId ?? null,
        listingId: dto.listingId ?? null,
        memberId: user.id,
        dueAt,
        note: dto.note ?? null,
        createdById: user.id,
      });
      return (await this.shapeFor(user.id, [row], tx))[0];
    });
  }

  /**
   * A MANUAL reminder on an owner inside the caller's transaction, for its member (a call
   * outcome's reminder). 400 REMINDER_IN_PAST rolls the whole transaction back.
   */
  async addToOwner(tx: Tx, input: OwnerReminderInput): Promise<void> {
    const dueAt = this.assertFuture(input.dueAt);
    await this.reminders.create(tx, {
      kind: 'MANUAL',
      ownerId: input.ownerId,
      memberId: input.memberId,
      dueAt,
      note: input.note ?? null,
      createdById: input.createdById,
    });
  }

  /** The caller's own reminder on a live record, read inside `tx`; 404 otherwise. */
  private async own(tx: Tx, id: string, user: CurrentUser) {
    return assertFound(
      await this.reminders.findOne(
        { id, memberId: user.id, ...ON_LIVE_RECORD },
        tx,
      ),
      'Reminder',
    );
  }

  async update(
    id: string,
    dto: UpdateReminderDto,
    user: CurrentUser,
  ): Promise<Reminder> {
    return this.db.transaction(async (tx) => {
      const current = await this.own(tx, id, user);
      const refusal = editRefusal(current, dto);
      if (refusal === 'DONE') throw reminderDone();
      if (refusal === 'SYSTEM') {
        throw systemReminder(
          'A take-down task stays due until the ad is taken down',
        );
      }

      const data: Prisma.ReminderUncheckedUpdateInput = {};
      if (dto.dueAt !== undefined) data.dueAt = this.assertFuture(dto.dueAt);
      if (dto.note !== undefined) data.note = dto.note;
      if (Object.keys(data).length) {
        // Conditional: a reminder closed meanwhile is not edited.
        if ((await this.reminders.updateOpen(tx, id, data)) === 0) {
          throw reminderDone();
        }
      }
      return (
        await this.shapeFor(user.id, [await this.own(tx, id, user)], tx)
      )[0];
    });
  }

  /**
   * Marks the caller's MANUAL reminder done. Ad reminders close only through their listing
   * (400 SYSTEM_REMINDER). Marking a done reminder done again changes nothing.
   */
  async done(id: string, user: CurrentUser): Promise<Reminder> {
    return this.db.transaction(async (tx) => {
      const current = await this.own(tx, id, user);
      if (isSystemKind(current.kind)) {
        throw systemReminder(
          current.kind === 'AD_TAKE_DOWN'
            ? 'A take-down task closes when the ad is marked Taken down'
            : 'A check-in closes when the check-in is recorded',
        );
      }
      if (!current.doneAt) {
        await this.reminders.updateOpen(tx, id, { doneAt: this.clock.now() });
      }
      return (
        await this.shapeFor(user.id, [await this.own(tx, id, user)], tx)
      )[0];
    });
  }

  // ------------------------------------------------------------------ for other domains

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

  /**
   * Closes the open reminders of these owners/listings: all of them when a record is deleted
   * (business doc: Reminder), or only `kinds` (listings: the take-down task once the ad is
   * Taken down, the check-in once it is recorded).
   *
   * Without `kinds` the record is being deleted: the reminders are flagged `closedByDelete`, so
   * analytics doesn't count them as done.
   */
  closeOpenReminders(
    tx: Tx,
    targets: ReminderTargets,
    kinds?: ReminderKind[],
  ): Promise<number> {
    return this.reminders.closeOpen(
      tx,
      targets,
      this.clock.now(),
      kinds,
      kinds === undefined,
    );
  }

  /**
   * An ad reminder (AD_CHECK_IN, AD_TAKE_DOWN) on a listing for its member, inside the
   * listing's transaction. No past-due check: a take-down task is due at once.
   */
  async addListingTask(
    tx: Tx,
    input: {
      kind: Exclude<ReminderKind, 'MANUAL'>;
      listingId: string;
      memberId: string | null;
      dueAt: Date;
      createdById?: string;
    },
  ): Promise<void> {
    await this.reminders.create(tx, {
      kind: input.kind,
      listingId: input.listingId,
      memberId: input.memberId,
      dueAt: input.dueAt,
      createdById: input.createdById ?? null,
    });
  }
}
