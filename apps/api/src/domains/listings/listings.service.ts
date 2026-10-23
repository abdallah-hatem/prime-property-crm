import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import {
  ErrorCode,
  LISTING_LATEST_NOTES,
  ListingErrorCode,
  toE164,
  type AssignListingsResponse,
  type Listing,
  type ListingRow,
  type ListingStatus,
  type Note,
  listingTitle,
} from '@prime-crm/shared';
import type { Prisma } from '@prisma/client';
import type { PaginationQueryDto } from '../../common/dto/pagination-query.dto';
import type { Paginated } from '../../common/interfaces/api-response.interface';
import type { CurrentUser } from '../../common/interfaces/current-user.interface';
import type { Tx } from '../../common/interfaces/transaction.interface';
import { Clock } from '../../common/providers/clock';
import { SettingsRepository } from '../../common/repositories/settings.repository';
import { UserDirectoryRepository } from '../../common/repositories/user-directory.repository';
import { cairoToday } from '../../common/utils/cairo-date.util';
import { assertFound, ownerScope } from '../../common/utils/ownership.util';
import { pageWindow, toPage } from '../../common/utils/pagination.util';
import { hasPermission } from '../../common/utils/permissions.util';
import { parseSearch } from '../../common/utils/phone-search.util';
import { isUniqueViolation } from '../../common/utils/prisma-error.util';
import { DatabaseService } from '../../database/database.service';
import { ActivityService } from '../activity/activity.service';
import { assignActivity } from '../assignment/assign-activity';
import { AssignmentService } from '../assignment/assignment.service';
import { NotesService } from '../notes/notes.service';
import { RemindersService } from '../reminders/reminders.service';
import { TrashService } from '../trash/trash.service';
import type { CreateListingDto } from './dto/create-listing.dto';
import type {
  AdCheckInDto,
  AssignListingsDto,
  UpdateAdDto,
} from './dto/listing-actions.dto';
import type { ListingListQueryDto } from './dto/listing-query.dto';
import type { UpdateListingDto } from './dto/update-listing.dto';
import type {
  ListingExportRow,
  ListingFilter,
} from './interfaces/listing.interface';
import { toListing, toListingRow } from './listing.shape';
import {
  adChange,
  addDays,
  canManage,
  canSeePhone,
  checkInRefusal,
  listingOrder,
  statusEffects,
} from './listings.pure';
import {
  ListingRepository,
  type ListingCore,
  type ListingOwner,
} from './repositories/listing.repository';

function conflict(error: ListingErrorCode, message: string, data?: object) {
  return new ConflictException({ message, error, ...(data && { data }) });
}

const ownerAlreadyListed = () =>
  conflict(
    ListingErrorCode.OWNER_ALREADY_LISTED,
    'This owner already has a listing',
  );
const phoneInListing = () =>
  conflict(
    ListingErrorCode.PHONE_IN_LISTING,
    'Another listing already has this owner phone',
  );

function forbidden(message: string): ForbiddenException {
  return new ForbiddenException({ message, error: ErrorCode.FORBIDDEN });
}

/** Optional create fields: absent stays null. */
type ListingFields = Omit<
  CreateListingDto,
  'ownerId' | 'ownerName' | 'ownerPhone' | 'assignedTo'
>;

function fieldsOf(dto: CreateListingDto): ListingFields {
  return {
    purpose: dto.purpose,
    type: dto.type,
    area: dto.area,
    compound: dto.compound,
    address: dto.address,
    sizeSqm: dto.sizeSqm,
    floor: dto.floor,
    bedrooms: dto.bedrooms,
    bathrooms: dto.bathrooms,
    price: dto.price,
    furnishing: dto.furnishing,
    description: dto.description,
  };
}

/** The search filters without paging (the search and the export share them). */
type ListingFilterQuery = Omit<ListingListQueryDto, 'page' | 'limit'>;

/**
 * Listings. Anyone searches and opens any listing; the owner phone shows only to its member
 * and to listings.manageAll. Changes (edit, status, ad, check-in, notes, photos) need the
 * listing assigned to the caller or listings.manageAll: otherwise 403 (the listing itself is
 * visible to everyone, so hiding it behind a 404 protects nothing).
 */
@Injectable()
export class ListingsService {
  constructor(
    private readonly db: DatabaseService,
    private readonly listings: ListingRepository,
    private readonly users: UserDirectoryRepository,
    private readonly settings: SettingsRepository,
    private readonly notes: NotesService,
    private readonly reminders: RemindersService,
    private readonly assignment: AssignmentService,
    private readonly trash: TrashService,
    private readonly activity: ActivityService,
    private readonly clock: Clock,
  ) {}

  // ------------------------------------------------------------------ search

  private filterFor(query: ListingFilterQuery, user: CurrentUser) {
    const now = this.clock.now();
    const search = parseSearch(query.q);
    const filter: ListingFilter = {
      purpose: query.purpose,
      types: query.type,
      area: query.area,
      compound: query.compound,
      priceMin: query.priceMin,
      priceMax: query.priceMax,
      sizeMin: query.sizeMin,
      sizeMax: query.sizeMax,
      bedroomsMin: query.bedroomsMin,
      bathroomsMin: query.bathroomsMin,
      floorMin: query.floorMin,
      floorMax: query.floorMax,
      statuses: query.status?.length ? query.status : ['AVAILABLE'],
      adStatus: query.adStatus,
      checkInDue:
        query.checkInDue === undefined
          ? undefined
          : { due: query.checkInDue, before: cairoToday(now).end },
      search: search && {
        ...search,
        phoneMemberId: hasPermission(user, 'listings.manageAll')
          ? null
          : user.id,
      },
    };
    if (query.assignedTo === 'me') filter.assignedTo = user.id;
    else if (query.assignedTo === 'unassigned') filter.assignedTo = null;
    else if (query.assignedTo) filter.assignedTo = query.assignedTo;
    return filter;
  }

  /** Client search: every listing (Available by default), never a phone in a row. */
  async list(
    query: ListingListQueryDto,
    user: CurrentUser,
  ): Promise<Paginated<ListingRow>> {
    const window = pageWindow(query.page, query.limit);
    const [{ rows, total }, language] = await Promise.all([
      this.listings.findRows(
        this.listings.whereOf(this.filterFor(query, user)),
        listingOrder(query.sort),
        window.skip,
        window.take,
      ),
      this.users.languageOf(user.id),
    ]);
    const dueBefore = cairoToday(this.clock.now()).end;
    return toPage(
      rows.map((row) => toListingRow(row, language, dueBefore)),
      total,
      window,
    );
  }

  /**
   * The listings export (T11): the search's filters and order, every page at once, with the
   * owner's name and phone only where the caller may see them. Counts first: over `max`
   * matches, no rows are read (`rows` is empty).
   */
  async exportRows(
    query: ListingFilterQuery,
    user: CurrentUser,
    max: number,
  ): Promise<{ total: number; rows: ListingExportRow[] }> {
    const where = this.listings.whereOf(this.filterFor(query, user));
    const total = await this.listings.count(where);
    if (total > max || total === 0) return { total, rows: [] };
    const [rows, language] = await Promise.all([
      this.listings.findExportRows(where, listingOrder(query.sort), max),
      this.users.languageOf(user.id),
    ]);
    return {
      total,
      rows: rows.map(({ assignedToId, ownerName, ownerPhone, ...row }) => {
        const visible = canSeePhone({ assignedToId }, user);
        return {
          ...row,
          title: listingTitle(row, language),
          ownerName: visible ? ownerName : null,
          ownerPhone: visible ? ownerPhone : null,
        };
      }),
    };
  }

  // ------------------------------------------------------------------ one listing

  /** The full `Listing` as the caller may see it (inside `tx` after a write). */
  private async detail(
    id: string,
    user: CurrentUser,
    tx?: Tx,
  ): Promise<Listing> {
    // Sequential: a transaction runs on one connection.
    const row = assertFound(await this.listings.findDetail(id, tx), 'Listing');
    const notes = await this.notes.latest(
      { listingId: id },
      LISTING_LATEST_NOTES,
      tx,
    );
    const language = await this.users.languageOf(user.id, tx);
    return toListing(row, notes, {
      language,
      checkInDueBefore: cairoToday(this.clock.now()).end,
      showPhone: canSeePhone(row, user),
    });
  }

  async get(id: string, user: CurrentUser): Promise<Listing> {
    return this.detail(id, user);
  }

  /**
   * The live listing, locked for the transaction, when the caller may change it: 404 when it
   * doesn't exist (or is in the trash), 403 when it isn't theirs. Photos and uploads use it.
   */
  async lockManageable(
    tx: Tx,
    id: string,
    user: CurrentUser,
  ): Promise<ListingCore> {
    const listing = assertFound(
      await this.listings.lockCore(tx, id),
      'Listing',
    );
    if (!canManage(listing, user)) {
      throw forbidden(
        'Only the listing’s member or listings.manageAll can change it',
      );
    }
    return listing;
  }

  /** Read-only form of `lockManageable` (the upload handshake). */
  async assertManageable(id: string, user: CurrentUser): Promise<void> {
    const listing = assertFound(await this.listings.findCore(id), 'Listing');
    if (!canManage(listing, user)) {
      throw forbidden(
        'Only the listing’s member or listings.manageAll can change it',
      );
    }
  }

  // ------------------------------------------------------------------ create

  /**
   * Refuses a phone that another record holds: a live listing (PHONE_IN_LISTING) or a trashed
   * owner (PHONE_IN_TRASH for trash.restore, PHONE_EXISTS otherwise). Returns the live owner
   * holding it, if any (a direct listing links to it).
   */
  private async phoneOwner(
    tx: Tx,
    phone: string,
    user: CurrentUser,
    exceptListingId?: string,
  ): Promise<ListingOwner | null> {
    if (await this.listings.liveListingWithPhone(tx, phone, exceptListingId)) {
      throw phoneInListing();
    }
    const owner = await this.listings.ownerWithPhone(tx, phone);
    if (owner?.deletedAt) {
      if (hasPermission(user, 'trash.restore')) {
        throw conflict(
          ListingErrorCode.PHONE_IN_TRASH,
          'This phone number belongs to an owner in the trash',
          { phone, ownerId: owner.id },
        );
      }
      throw conflict(
        ListingErrorCode.PHONE_EXISTS,
        'This phone number already belongs to an owner',
      );
    }
    return owner;
  }

  /** A lost race on a live-listing unique index becomes the same 409 as the pre-check. */
  private async uniqueSafe<T>(
    phone: () => string | null,
    work: () => Promise<T>,
  ) {
    try {
      return await work();
    } catch (error) {
      if (!isUniqueViolation(error)) throw error;
      const value = phone();
      const clash =
        value &&
        (await this.db.transaction((tx) =>
          this.listings.liveListingWithPhone(tx, value),
        ));
      throw clash ? phoneInListing() : ownerAlreadyListed();
    }
  }

  /**
   * From an owner (`ownerId`, own or owners.viewAll): the contact comes from the owner, who
   * becomes Listed. Direct (`ownerName` + `ownerPhone`, listings.create): a phone of an owner
   * lead links it, the lead becomes Listed and moves to the listing's member. The listing's
   * member is `assignedTo` (owners.assign); by default the owner's member for a listing
   * from an owner (else the creator), and the creator for a direct one.
   */
  async create(dto: CreateListingDto, user: CurrentUser): Promise<Listing> {
    if (dto.assignedTo && !hasPermission(user, 'owners.assign')) {
      throw forbidden('Assigning a listing needs owners.assign');
    }
    if (!dto.ownerId && !hasPermission(user, 'listings.create')) {
      throw forbidden('Adding a listing directly needs listings.create');
    }
    let phone: string | null = null;

    return this.uniqueSafe(
      () => phone,
      () =>
        this.db.transaction(async (tx) => {
          const assignee = await this.assignment.assertAssignee(
            tx,
            dto.assignedTo ?? null,
          );
          let owner: ListingOwner | null;
          if (dto.ownerId) {
            owner = assertFound(
              await this.listings.lockOwner(
                tx,
                dto.ownerId,
                ownerScope(user, 'assignedToId', { bypass: 'owners.viewAll' }),
              ),
              'Owner',
            );
            if (await this.listings.ownerHasLiveListing(tx, owner.id)) {
              throw ownerAlreadyListed();
            }
            phone = owner.phones[0];
            if (await this.listings.liveListingWithPhone(tx, phone)) {
              throw phoneInListing();
            }
          } else {
            const e164 = toE164(dto.ownerPhone);
            if (!e164) {
              // The DTO already refuses it; kept so the type is a real phone.
              throw new BadRequestException({
                message: 'ownerPhone must be a valid phone number',
                error: ErrorCode.VALIDATION_FAILED,
              });
            }
            phone = e164;
            owner = await this.phoneOwner(tx, e164, user);
            if (owner) {
              owner = assertFound(
                await this.listings.lockOwner(tx, owner.id, {}),
                'Owner',
              );
              if (await this.listings.ownerHasLiveListing(tx, owner.id)) {
                throw ownerAlreadyListed();
              }
            }
          }

          // Default member: from an owner, the owner's member (the creator, unless an admin
          // lists someone else's owner); direct, the creator, and a linked lead moves to them.
          const memberId =
            assignee?.id ??
            (dto.ownerId ? (owner?.assignedToId ?? user.id) : user.id);
          const { id } = await this.listings.createListing(tx, {
            ...fieldsOf(dto),
            ownerName:
              owner && dto.ownerId ? owner.name : (dto.ownerName as string),
            ownerPhone: phone,
            ownerId: owner?.id ?? null,
            assignedToId: memberId,
            createdById: user.id,
          });

          if (owner) {
            await this.listings.setOwnerStatus(tx, owner.id, 'LISTED');
            if (owner.assignedToId !== memberId) {
              // An owner and its listing always share a member.
              await this.assignment.reassignOwnerAndListing(
                tx,
                { listingIds: [id] },
                memberId,
                user.id,
              );
              const to =
                assignee ?? (await this.users.findActive(memberId, tx));
              await this.activity.record(
                tx,
                assignActivity(user.id, {
                  kind: 'OWNERS',
                  count: 1,
                  assignee: to,
                }),
              );
            }
          }
          return this.detail(id, user, tx);
        }),
    );
  }

  // ------------------------------------------------------------------ edit

  async update(
    id: string,
    dto: UpdateListingDto,
    user: CurrentUser,
  ): Promise<Listing> {
    const phone = dto.ownerPhone ? (toE164(dto.ownerPhone) as string) : null;
    return this.uniqueSafe(
      () => phone,
      () =>
        this.db.transaction(async (tx) => {
          const listing = await this.lockManageable(tx, id, user);
          if (phone && phone !== listing.ownerPhone) {
            const holder = await this.phoneOwner(tx, phone, user, id);
            if (holder && holder.id !== listing.ownerId) {
              // A listing's phone never moves onto another owner's number.
              throw conflict(
                ListingErrorCode.PHONE_EXISTS,
                'This phone number already belongs to another owner',
                hasPermission(user, 'owners.viewAll')
                  ? { phone, ownerId: holder.id }
                  : undefined,
              );
            }
          }
          const data: Prisma.ListingUncheckedUpdateInput = { ...dto };
          if (phone) data.ownerPhone = phone;
          await this.listings.updateFields(tx, id, data);
          return this.detail(id, user, tx);
        }),
    );
  }

  // ------------------------------------------------------------------ status and ad

  /** Schedules the next check-in, `adCheckInDays` (read now) after `from`. */
  private async scheduleCheckIn(
    tx: Tx,
    listing: ListingCore,
    from: Date,
    actorId: string,
  ): Promise<void> {
    const days = await this.settings.adCheckInDays(tx);
    await this.reminders.addListingTask(tx, {
      kind: 'AD_CHECK_IN',
      listingId: listing.id,
      memberId: listing.assignedToId,
      dueAt: addDays(from, days),
      createdById: actorId,
    });
  }

  /**
   * Moves a (locked) listing to `to`. Leaving Available closes the open check-in and, while the
   * ad is Live, opens one take-down task (never a second); back to Available with a Live ad
   * resumes check-ins.
   */
  private async applyStatus(
    tx: Tx,
    listing: ListingCore,
    to: ListingStatus,
    actorId: string,
  ): Promise<void> {
    if (listing.status === to) return;
    const now = this.clock.now();
    const effects = statusEffects(listing.status, to, listing.adStatus, {
      takeDown: await this.listings.hasOpenReminder(
        tx,
        listing.id,
        'AD_TAKE_DOWN',
      ),
      checkIn: await this.listings.hasOpenReminder(
        tx,
        listing.id,
        'AD_CHECK_IN',
      ),
    });
    await this.listings.updateFields(tx, listing.id, { status: to });
    if (effects.closeCheckIn) {
      await this.reminders.closeOpenReminders(
        tx,
        { listingIds: [listing.id] },
        ['AD_CHECK_IN'],
      );
    }
    if (effects.openTakeDown) {
      await this.reminders.addListingTask(tx, {
        kind: 'AD_TAKE_DOWN',
        listingId: listing.id,
        memberId: listing.assignedToId,
        dueAt: now,
        createdById: actorId,
      });
    }
    if (effects.scheduleCheckIn) {
      await this.scheduleCheckIn(tx, listing, now, actorId);
    }
  }

  async setStatus(
    id: string,
    status: ListingStatus,
    user: CurrentUser,
  ): Promise<Listing> {
    return this.db.transaction(async (tx) => {
      const listing = await this.lockManageable(tx, id, user);
      await this.applyStatus(tx, listing, status, user.id);
      return this.detail(id, user, tx);
    });
  }

  async updateAd(
    id: string,
    dto: UpdateAdDto,
    user: CurrentUser,
  ): Promise<Listing> {
    return this.db.transaction(async (tx) => {
      const listing = await this.lockManageable(tx, id, user);
      const now = this.clock.now();
      const change = adChange(listing, dto, now);
      if (change.kind === 'refused') {
        throw new BadRequestException({
          message: change.message,
          error: change.error,
        });
      }
      const data: Prisma.ListingUncheckedUpdateInput = {
        adStatus: dto.status,
        adLink: change.link,
      };
      if (change.postedAt !== undefined) data.adPostedAt = change.postedAt;
      if (change.takenDownAt !== undefined) {
        data.adTakenDownAt = change.takenDownAt;
      }
      await this.listings.updateFields(tx, id, data);
      if (change.close.length) {
        await this.reminders.closeOpenReminders(
          tx,
          { listingIds: [id] },
          change.close,
        );
      }
      if (
        change.scheduleCheckIn &&
        !(await this.listings.hasOpenReminder(tx, id, 'AD_CHECK_IN'))
      ) {
        await this.scheduleCheckIn(tx, listing, now, user.id);
      }
      return this.detail(id, user, tx);
    });
  }

  /**
   * Records a check-in on a Live ad: closes the open check-in and schedules the next one.
   * Not available any more → Off market, which opens the take-down task.
   */
  async checkIn(
    id: string,
    dto: AdCheckInDto,
    user: CurrentUser,
  ): Promise<Listing> {
    return this.db.transaction(async (tx) => {
      const listing = await this.lockManageable(tx, id, user);
      const refusal = checkInRefusal(listing);
      if (refusal) {
        throw new BadRequestException({
          message: refusal.message,
          error: refusal.error,
        });
      }
      const now = this.clock.now();
      await this.listings.updateFields(tx, id, { lastCheckInAt: now });
      await this.reminders.closeOpenReminders(tx, { listingIds: [id] }, [
        'AD_CHECK_IN',
      ]);
      if (dto.note)
        await this.notes.add({ listingId: id }, user.id, dto.note, tx);
      if (dto.stillAvailable) {
        await this.scheduleCheckIn(tx, listing, now, user.id);
      } else {
        await this.applyStatus(tx, listing, 'OFF_MARKET', user.id);
      }
      return this.detail(id, user, tx);
    });
  }

  // ------------------------------------------------------------------ assign

  /**
   * Assigns listings (deleted or unknown ids skipped) to an active member or to nobody; their
   * linked owners and open reminders follow. One activity entry per batch that moved something.
   */
  async assign(
    dto: AssignListingsDto,
    user: CurrentUser,
  ): Promise<AssignListingsResponse> {
    return this.db.transaction(async (tx) => {
      const assignee = await this.assignment.assertAssignee(tx, dto.assigneeId);
      const result = await this.assignment.reassignOwnerAndListing(
        tx,
        { listingIds: dto.listingIds },
        dto.assigneeId,
        user.id,
      );
      const moved = result.listingIds.length;
      if (moved > 0) {
        await this.activity.record(
          tx,
          assignActivity(user.id, { kind: 'LISTINGS', count: moved, assignee }),
        );
      }
      return { moved };
    });
  }

  // ------------------------------------------------------------------ delete

  /**
   * To the trash (listings.manageAll): its open reminders close (check-in and take-down
   * included) and its owner goes back to Interested. TrashService logs the DELETE.
   */
  async remove(id: string, user: CurrentUser): Promise<void> {
    await this.db.transaction(async (tx) => {
      const listing = assertFound(
        await this.listings.lockCore(tx, id),
        'Listing',
      );
      await this.reminders.closeOpenReminders(tx, { listingIds: [id] });
      await this.trash.softDelete(tx, 'LISTING', id, user.id);
      if (listing.ownerId) {
        await this.listings.setOwnerStatus(
          tx,
          listing.ownerId,
          'INTERESTED',
          'LISTED',
        );
      }
    });
  }

  // ------------------------------------------------------------------ notes

  async listNotes(
    id: string,
    query: PaginationQueryDto,
  ): Promise<Paginated<Note>> {
    assertFound(await this.listings.findCore(id), 'Listing');
    return this.notes.list({ listingId: id }, query.page, query.limit);
  }

  async addNote(id: string, body: string, user: CurrentUser): Promise<Note> {
    return this.db.transaction(async (tx) => {
      await this.lockManageable(tx, id, user);
      return this.notes.add({ listingId: id }, user.id, body, tx);
    });
  }

  // ------------------------------------------------------------------ restore

  /**
   * Before the trash core restores a listing: refused when its owner has another live listing
   * now (OWNER_ALREADY_LISTED), or its phone went to another live listing (PHONE_IN_LISTING) or
   * to another owner (PHONE_EXISTS).
   */
  async validateRestore(tx: Tx, id: string): Promise<void> {
    const state = await this.listings.findRestoreState(tx, id);
    if (!state) return;
    if (
      state.ownerId &&
      !state.owner?.deletedAt &&
      (await this.listings.ownerHasLiveListing(tx, state.ownerId, id))
    ) {
      throw ownerAlreadyListed();
    }
    if (await this.listings.liveListingWithPhone(tx, state.ownerPhone, id)) {
      throw phoneInListing();
    }
    const holder = await this.listings.ownerWithPhone(tx, state.ownerPhone);
    if (holder && holder.id !== state.ownerId) {
      throw conflict(
        ListingErrorCode.PHONE_EXISTS,
        'This listing’s phone now belongs to another owner',
      );
    }
  }

  /**
   * After the restore: the live owner is Listed again and the pair shares the owner's member
   * (or nobody, when the listing's member was deactivated meanwhile and there is no owner).
   * A Live ad gets its reminder back: a check-in while Available, else a take-down task.
   */
  async afterRestore(tx: Tx, id: string, actorId: string): Promise<void> {
    const state = await this.listings.findRestoreState(tx, id);
    if (!state) return;
    const ownerLive = state.ownerId !== null && state.owner?.deletedAt === null;
    if (ownerLive) {
      await this.listings.setOwnerStatus(tx, state.ownerId as string, 'LISTED');
      if (state.owner?.assignedToId !== state.assignedToId) {
        await this.assignment.reassignOwnerAndListing(
          tx,
          { listingIds: [id] },
          state.owner?.assignedToId ?? null,
          actorId,
        );
      }
    } else if (state.assignedTo && !state.assignedTo.active) {
      await this.assignment.reassignOwnerAndListing(
        tx,
        { listingIds: [id] },
        null,
        actorId,
      );
    }
    const listing = assertFound(
      await this.listings.findCore(id, tx),
      'Listing',
    );
    if (listing.adStatus !== 'LIVE') return;
    if (listing.status === 'AVAILABLE') {
      await this.scheduleCheckIn(tx, listing, this.clock.now(), actorId);
    } else {
      await this.reminders.addListingTask(tx, {
        kind: 'AD_TAKE_DOWN',
        listingId: id,
        memberId: listing.assignedToId,
        dueAt: this.clock.now(),
        createdById: actorId,
      });
    }
  }
}
