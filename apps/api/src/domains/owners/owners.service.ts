import {
  ConflictException,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import {
  ErrorCode,
  OwnerErrorCode,
  toE164,
  type AssignOwnersResponse,
  type Note,
  type Owner,
  type OwnerIdsResponse,
  type OwnerRow,
  type OwnerTimelineItem,
  type PhoneConflict,
} from '@prime-crm/shared';
import type { Prisma } from '@prisma/client';
import type { PaginationQueryDto } from '../../common/dto/pagination-query.dto';
import type { Paginated } from '../../common/interfaces/api-response.interface';
import type { CurrentUser } from '../../common/interfaces/current-user.interface';
import type { Tx } from '../../common/interfaces/transaction.interface';
import { Clock } from '../../common/providers/clock';
import { UserDirectoryRepository } from '../../common/repositories/user-directory.repository';
import { cairoToday } from '../../common/utils/cairo-date.util';
import { assertFound, ownerScope } from '../../common/utils/ownership.util';
import { pageWindow, toPage } from '../../common/utils/pagination.util';
import { hasPermission } from '../../common/utils/permissions.util';
import { isUniqueViolation } from '../../common/utils/prisma-error.util';
import { DatabaseService } from '../../database/database.service';
import { ActivityService } from '../activity/activity.service';
import { assignActivity } from '../assignment/assign-activity';
import { AssignmentService } from '../assignment/assignment.service';
import { toCall } from '../calls/call.shape';
import { NotesService } from '../notes/notes.service';
import { RemindersService } from '../reminders/reminders.service';
import { TrashService } from '../trash/trash.service';
import type { AssignOwnersDto } from './dto/assign-owners.dto';
import type { CreateOwnerDto } from './dto/create-owner.dto';
import type {
  OwnerIdsQueryDto,
  OwnerListQueryDto,
} from './dto/owner-query.dto';
import type { UpdateOwnerDto } from './dto/update-owner.dto';
import type { OwnerFilter } from './interfaces/owner.interface';
import { toOwner, toOwnerRow } from './owner.shape';
import {
  doNotCallChange,
  OWNER_LATEST_NOTES,
  ownerOrder,
  parseSearch,
} from './owners.pure';
import {
  OwnerRepository,
  type OwnerCore,
  type PhoneHolder,
} from './repositories/owner.repository';

type OwnerFilterQuery = Pick<
  OwnerListQueryDto,
  'q' | 'status' | 'assignedTo' | 'area' | 'importId' | 'hasReminder' | 'sort'
>;

const VIEW_ALL = { bypass: 'owners.viewAll' } as const;

function phoneExists(data?: PhoneConflict): ConflictException {
  return new ConflictException({
    message: 'This phone number already belongs to an owner or a listing',
    error: OwnerErrorCode.PHONE_EXISTS,
    ...(data ? { data } : {}),
  });
}

/**
 * Owners (homeowner leads). Everything a member does is scoped to the owners assigned to them;
 * anything else answers 404 (spec: not yours = 404). owners.viewAll widens that to every owner.
 */
@Injectable()
export class OwnersService {
  constructor(
    private readonly db: DatabaseService,
    private readonly owners: OwnerRepository,
    private readonly users: UserDirectoryRepository,
    private readonly notes: NotesService,
    private readonly reminders: RemindersService,
    private readonly assignment: AssignmentService,
    private readonly trash: TrashService,
    private readonly activity: ActivityService,
    private readonly clock: Clock,
  ) {}

  // ------------------------------------------------------------------ lists

  /**
   * Filters scoped to the caller: without owners.viewAll, own owners only, whatever was asked.
   * `idsOnly` (`/owners/ids`, owners.assign) reaches every owner, since assigning works on any
   * owner, but without owners.viewAll it can't search by phone (no phone-to-owner probing).
   */
  private filterFor(
    query: OwnerFilterQuery,
    user: CurrentUser,
    idsOnly = false,
  ): OwnerFilter {
    const viewAll = hasPermission(user, 'owners.viewAll');
    const search = parseSearch(query.q);
    const filter: OwnerFilter = {
      statuses: query.status,
      area: query.area,
      importId: query.importId,
      hasReminder: query.hasReminder,
      search:
        search && !viewAll
          ? { ...search, phoneDigits: idsOnly ? null : search.phoneDigits }
          : search,
    };
    if (!viewAll && !idsOnly) {
      filter.memberId = user.id;
    } else if (query.assignedTo === 'me') {
      filter.assignedTo = user.id;
    } else if (query.assignedTo === 'unassigned') {
      filter.assignedTo = null;
    } else if (query.assignedTo) {
      filter.assignedTo = query.assignedTo;
    }
    return filter;
  }

  async list(
    query: OwnerListQueryDto,
    user: CurrentUser,
  ): Promise<Paginated<OwnerRow>> {
    const window = pageWindow(query.page, query.limit);
    const [{ rows, total }, language] = await Promise.all([
      this.owners.findRows(
        this.owners.whereOf(this.filterFor(query, user)),
        ownerOrder(query.sort),
        window.skip,
        window.take,
      ),
      this.users.languageOf(user.id),
    ]);
    return toPage(
      rows.map((row) => toOwnerRow(row, language)),
      total,
      window,
    );
  }

  /**
   * The owners export (T11): the list's rows with the list's filters and scope, every page at
   * once. Counts first: over `max` matches, no rows are read (`rows` is empty).
   */
  async exportRows(
    query: OwnerFilterQuery,
    user: CurrentUser,
    max: number,
  ): Promise<{ total: number; rows: OwnerRow[] }> {
    const where = this.owners.whereOf(this.filterFor(query, user));
    const total = await this.owners.count(where);
    if (total > max || total === 0) return { total, rows: [] };
    const [{ rows }, language] = await Promise.all([
      this.owners.findRows(where, ownerOrder(query.sort), 0, max),
      this.users.languageOf(user.id),
    ]);
    return { total, rows: rows.map((row) => toOwnerRow(row, language)) };
  }

  /**
   * For "select all" and "next 200 unassigned" (owners.assign): ids over every owner, same
   * order as the list.
   */
  async ids(
    query: OwnerIdsQueryDto,
    user: CurrentUser,
  ): Promise<OwnerIdsResponse> {
    return this.owners.findIds(
      this.owners.whereOf(this.filterFor(query, user, true)),
      ownerOrder(query.sort),
      query.take,
    );
  }

  /**
   * The caller's own calling list: overdue reminder, due today (Cairo), then New, Call back,
   * Contacted, Interested, Not interested; never called first, then longest ago.
   */
  async callingList(
    query: PaginationQueryDto,
    user: CurrentUser,
  ): Promise<Paginated<OwnerRow>> {
    const window = pageWindow(query.page, query.limit);
    const now = this.clock.now();
    const { ids, total } = await this.owners.callingListIds(
      user.id,
      now,
      cairoToday(now).end,
      window.skip,
      window.take,
    );
    const [rows, language] = await Promise.all([
      this.owners.findRowsByIds(ids),
      this.users.languageOf(user.id),
    ]);
    return toPage(
      rows.map((row) => toOwnerRow(row, language)),
      total,
      window,
    );
  }

  // ------------------------------------------------------------------ one owner

  /** The owner when the caller may see it (own, or owners.viewAll); 404 otherwise. */
  private async accessible(
    id: string,
    user: CurrentUser,
    tx?: Tx,
  ): Promise<OwnerCore> {
    const owner = await this.owners.findCore(
      id,
      ownerScope(user, 'assignedToId', VIEW_ALL),
      tx,
    );
    return assertFound(owner, 'Owner');
  }

  /** Reads the full `Owner` (inside `tx` when given, so a write's result is seen). */
  private async detail(id: string, user: CurrentUser, tx?: Tx): Promise<Owner> {
    // Sequential: a transaction runs on one connection.
    const row = await this.owners.findDetail(id, tx);
    const notes = await this.notes.latest(
      { ownerId: id },
      OWNER_LATEST_NOTES,
      tx,
    );
    const language = await this.users.languageOf(user.id, tx);
    return toOwner(assertFound(row, 'Owner'), notes, language);
  }

  async get(id: string, user: CurrentUser): Promise<Owner> {
    await this.accessible(id, user);
    return this.detail(id, user);
  }

  /**
   * Refuses phones another record holds. A trashed owner keeps its phones: callers with
   * trash.restore hear PHONE_IN_TRASH, others the plain PHONE_EXISTS. Ids go only to callers
   * with owners.viewAll (no data about owners that aren't the caller's).
   */
  private assertPhonesFree(
    holders: PhoneHolder[],
    user: CurrentUser,
    exceptOwnerId?: string,
  ): void {
    const conflict = holders.find((h) =>
      h.ownerId
        ? h.ownerId !== exceptOwnerId
        : h.linkedOwnerId !== exceptOwnerId,
    );
    if (!conflict) return;
    const canSeeIds = hasPermission(user, 'owners.viewAll');

    if (conflict.ownerDeleted) {
      if (hasPermission(user, 'trash.restore')) {
        throw new ConflictException({
          message: 'This phone number belongs to an owner in the trash',
          error: OwnerErrorCode.PHONE_IN_TRASH,
          data: { phone: conflict.phone, ownerId: conflict.ownerId },
        });
      }
      throw phoneExists();
    }
    throw phoneExists(
      canSeeIds
        ? conflict.ownerId
          ? { phone: conflict.phone, ownerId: conflict.ownerId }
          : { phone: conflict.phone, listingId: conflict.listingId }
        : undefined,
    );
  }

  /** A lost race on the unique phone index becomes the same 409 as the pre-check. */
  private async phoneSafe<T>(work: () => Promise<T>): Promise<T> {
    try {
      return await work();
    } catch (error) {
      if (isUniqueViolation(error)) throw phoneExists();
      throw error;
    }
  }

  async create(dto: CreateOwnerDto, user: CurrentUser): Promise<Owner> {
    if (dto.assignedTo && !hasPermission(user, 'owners.assign')) {
      throw new ForbiddenException({
        message: 'Assigning an owner needs owners.assign',
        error: ErrorCode.FORBIDDEN,
      });
    }
    const phones = dto.phones.map((p) => toE164(p) as string);

    return this.phoneSafe(() =>
      this.db.transaction(async (tx) => {
        const assignee = await this.assignment.assertAssignee(
          tx,
          dto.assignedTo ?? null,
        );
        this.assertPhonesFree(await this.owners.phoneHolders(tx, phones), user);

        const { id } = await this.owners.createWithPhones(
          tx,
          { name: dto.name, area: dto.area ?? null, createdById: user.id },
          phones,
        );
        if (dto.note)
          await this.notes.add({ ownerId: id }, user.id, dto.note, tx);
        if (assignee) {
          await this.assignment.reassignOwnerAndListing(
            tx,
            { ownerIds: [id] },
            assignee.id,
            user.id,
          );
          await this.activity.record(
            tx,
            assignActivity(user.id, { kind: 'OWNERS', count: 1, assignee }),
          );
        }
        return this.detail(id, user, tx);
      }),
    );
  }

  async update(
    id: string,
    dto: UpdateOwnerDto,
    user: CurrentUser,
  ): Promise<Owner> {
    const phones = dto.phones?.map((p) => toE164(p) as string);

    return this.phoneSafe(() =>
      this.db.transaction(async (tx) => {
        const owner = await this.accessible(id, user, tx);

        const change = doNotCallChange(
          owner.status,
          dto.doNotCall,
          hasPermission(user, 'owners.viewAll'),
        );
        if (change.kind === 'forbidden') {
          throw new ForbiddenException({
            message: 'Only an admin can clear Do not call',
            error: ErrorCode.FORBIDDEN,
          });
        }
        if (change.kind === 'listed') {
          throw new ConflictException({
            message: 'A listed owner is handled through its listing',
            error: OwnerErrorCode.OWNER_LISTED,
          });
        }

        if (phones) {
          this.assertPhonesFree(
            await this.owners.phoneHolders(tx, phones),
            user,
            id,
          );
          await this.owners.replacePhones(tx, id, phones);
        }

        const data: Prisma.OwnerUncheckedUpdateInput = {};
        if (dto.name !== undefined) data.name = dto.name;
        if (dto.area !== undefined) data.area = dto.area;
        if (change.kind === 'set') data.status = change.status;
        if (Object.keys(data).length || phones) {
          // Touch updatedAt even when only the phones changed.
          await this.owners.updateFields(tx, id, data);
        }
        return this.detail(id, user, tx);
      }),
    );
  }

  /** To the trash: refused while a live listing links to it; open reminders close; calls stay. */
  async remove(id: string, user: CurrentUser): Promise<void> {
    await this.db.transaction(async (tx) => {
      assertFound(await this.owners.findCore(id, {}, tx), 'Owner');
      if (await this.owners.hasLiveListing(tx, id)) {
        throw new ConflictException({
          message: 'Delete the listing first',
          error: OwnerErrorCode.OWNER_LISTED,
        });
      }
      await this.reminders.closeOpenReminders(tx, { ownerIds: [id] });
      await this.trash.softDelete(tx, 'OWNER', id, user.id);
    });
  }

  // ------------------------------------------------------------------ assign

  /**
   * Assigns the owners (deleted or unknown ids skipped) to an active member or to nobody; their
   * listings and open reminders follow. One activity entry for the whole batch.
   */
  async assign(
    dto: AssignOwnersDto,
    user: CurrentUser,
  ): Promise<AssignOwnersResponse> {
    return this.db.transaction(async (tx) => {
      const assignee = await this.assignment.assertAssignee(tx, dto.assigneeId);
      const result = await this.assignment.reassignOwnerAndListing(
        tx,
        { ownerIds: dto.ownerIds },
        dto.assigneeId,
        user.id,
      );
      const moved = result.ownerIds.length;
      if (moved > 0) {
        await this.activity.record(
          tx,
          assignActivity(user.id, { kind: 'OWNERS', count: moved, assignee }),
        );
      }
      return { moved };
    });
  }

  // ------------------------------------------------------------------ notes, timeline

  async listNotes(
    id: string,
    query: PaginationQueryDto,
    user: CurrentUser,
  ): Promise<Paginated<Note>> {
    await this.accessible(id, user);
    return this.notes.list({ ownerId: id }, query.page, query.limit);
  }

  async addNote(id: string, body: string, user: CurrentUser): Promise<Note> {
    await this.accessible(id, user);
    return this.notes.add({ ownerId: id }, user.id, body);
  }

  /** Calls, notes, reminders and assignments, newest first. */
  async timeline(
    id: string,
    query: PaginationQueryDto,
    user: CurrentUser,
  ): Promise<Paginated<OwnerTimelineItem>> {
    await this.accessible(id, user);
    const window = pageWindow(query.page, query.limit);
    const { refs, total } = await this.owners.timelinePage(
      id,
      window.skip,
      window.take,
    );
    const idsOf = (kind: string) =>
      refs.filter((r) => r.kind === kind).map((r) => r.id);

    const language = await this.users.languageOf(user.id);
    const [calls, notes, reminders, assignments] = await Promise.all([
      this.owners.findCallsByIds(idsOf('CALL')),
      this.notes.byIds(idsOf('NOTE')),
      this.reminders.byIds(idsOf('REMINDER'), language),
      this.owners.findAssignmentsByIds(idsOf('ASSIGN')),
    ]);
    const call = new Map(calls.map((c) => [c.id, c]));
    const note = new Map(notes.map((n) => [n.id, n]));
    const reminder = new Map(reminders.map((r) => [r.id, r]));
    const assign = new Map(assignments.map((a) => [a.id, a]));

    const items = refs.flatMap((ref): OwnerTimelineItem[] => {
      const at = ref.at.toISOString();
      switch (ref.kind) {
        case 'CALL': {
          const row = call.get(ref.id);
          return row ? [{ kind: 'CALL', at, call: toCall(row, language) }] : [];
        }
        case 'NOTE': {
          const row = note.get(ref.id);
          return row ? [{ kind: 'NOTE', at, note: row }] : [];
        }
        case 'REMINDER': {
          const row = reminder.get(ref.id);
          return row ? [{ kind: 'REMINDER', at, reminder: row }] : [];
        }
        case 'ASSIGN': {
          const row = assign.get(ref.id);
          return row
            ? [
                {
                  kind: 'ASSIGN',
                  at,
                  from: row.fromMember,
                  to: row.toMember,
                  by: row.by,
                },
              ]
            : [];
        }
      }
    });
    return toPage(items, total, window);
  }

  // ------------------------------------------------------------------ restore

  /**
   * After the trash core restores an owner: it comes back with its phones (never released) and
   * its listing link. Its status follows its listing (Listed with a live one; a Listed owner
   * whose listing is gone goes back to Interested), and an owner whose member was deactivated
   * meanwhile comes back unassigned.
   */
  async afterRestore(tx: Tx, ownerId: string, actorId: string): Promise<void> {
    const state = await this.owners.findRestoreState(tx, ownerId);
    if (!state) return;
    const hasListing = state.listings.length > 0;
    if (hasListing && state.status !== 'LISTED') {
      await this.owners.updateFields(tx, ownerId, { status: 'LISTED' });
    } else if (!hasListing && state.status === 'LISTED') {
      await this.owners.updateFields(tx, ownerId, { status: 'INTERESTED' });
    }
    if (state.assignedTo && !state.assignedTo.active) {
      await this.assignment.reassignOwnerAndListing(
        tx,
        { ownerIds: [ownerId] },
        null,
        actorId,
      );
    }
  }
}
