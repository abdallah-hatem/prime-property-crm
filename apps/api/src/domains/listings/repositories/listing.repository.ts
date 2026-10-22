import { Injectable } from '@nestjs/common';
import {
  Prisma,
  type LeadStatus,
  type Listing,
  type ReminderKind,
} from '@prisma/client';
import type { Tx } from '../../../common/interfaces/transaction.interface';
import {
  LIVE,
  SoftDeleteRepository,
} from '../../../common/repositories/soft-delete.repository';
import { escapeLike } from '../../../common/utils/like.util';
import { DatabaseService } from '../../../database/database.service';
import type { ListingFilter } from '../interfaces/listing.interface';

const PHOTO_ORDER = [
  { order: 'asc' },
  { createdAt: 'asc' },
  { id: 'asc' },
] as const satisfies Prisma.PhotoOrderByWithRelationInput[];

/** The columns behind `ListingRow`. */
export const LISTING_ROW_SELECT = {
  id: true,
  purpose: true,
  type: true,
  area: true,
  compound: true,
  price: true,
  sizeSqm: true,
  bedrooms: true,
  bathrooms: true,
  floor: true,
  status: true,
  adStatus: true,
  assignedTo: { select: { id: true, name: true } },
  photos: { where: LIVE, orderBy: PHOTO_ORDER, take: 1, select: { url: true } },
  reminders: {
    where: { kind: 'AD_CHECK_IN', doneAt: null },
    orderBy: { dueAt: 'asc' },
    take: 1,
    select: { dueAt: true },
  },
} as const satisfies Prisma.ListingSelect;

/** `Listing` = the row plus its details, owner, ad and every live photo. */
export const LISTING_DETAIL_SELECT = {
  ...LISTING_ROW_SELECT,
  address: true,
  furnishing: true,
  description: true,
  ownerName: true,
  ownerPhone: true,
  ownerId: true,
  assignedToId: true,
  adLink: true,
  adPostedAt: true,
  adTakenDownAt: true,
  lastCheckInAt: true,
  createdAt: true,
  updatedAt: true,
  photos: {
    where: LIVE,
    orderBy: PHOTO_ORDER,
    select: { id: true, url: true, order: true },
  },
} as const satisfies Prisma.ListingSelect;

/** The columns behind a listings-export row (T11). */
export const LISTING_EXPORT_SELECT = {
  purpose: true,
  type: true,
  area: true,
  compound: true,
  address: true,
  price: true,
  sizeSqm: true,
  bedrooms: true,
  bathrooms: true,
  floor: true,
  furnishing: true,
  status: true,
  adStatus: true,
  adLink: true,
  ownerName: true,
  ownerPhone: true,
  assignedToId: true,
  assignedTo: { select: { id: true, name: true } },
  createdAt: true,
} as const satisfies Prisma.ListingSelect;

export type ListingExportData = Prisma.ListingGetPayload<{
  select: typeof LISTING_EXPORT_SELECT;
}>;

export type ListingRowData = Prisma.ListingGetPayload<{
  select: typeof LISTING_ROW_SELECT;
}>;
export type ListingDetailData = Prisma.ListingGetPayload<{
  select: typeof LISTING_DETAIL_SELECT;
}>;

/** The fields access checks and lifecycle rules need. */
const CORE_SELECT = {
  id: true,
  status: true,
  adStatus: true,
  adLink: true,
  assignedToId: true,
  ownerId: true,
  ownerPhone: true,
} as const satisfies Prisma.ListingSelect;

export type ListingCore = Prisma.ListingGetPayload<{
  select: typeof CORE_SELECT;
}>;

/** An owner a listing is created from or linked to. */
export interface ListingOwner {
  id: string;
  name: string;
  status: LeadStatus;
  assignedToId: string | null;
  deletedAt: Date | null;
  /** Its phones in entry order (E.164). */
  phones: string[];
}

const OWNER_SELECT = {
  id: true,
  name: true,
  status: true,
  assignedToId: true,
  deletedAt: true,
  phones: { select: { phone: true }, orderBy: { position: 'asc' } },
} as const satisfies Prisma.OwnerSelect;

function toListingOwner(
  row: Prisma.OwnerGetPayload<{ select: typeof OWNER_SELECT }>,
): ListingOwner {
  return { ...row, phones: row.phones.map((p) => p.phone) };
}

/** What a restore needs to know about a just-restored (or about to be restored) listing. */
export interface ListingRestoreState extends ListingCore {
  owner: { deletedAt: Date | null; assignedToId: string | null } | null;
  assignedTo: { active: boolean } | null;
}

@Injectable()
export class ListingRepository extends SoftDeleteRepository<
  Listing,
  Prisma.ListingUncheckedCreateInput,
  Prisma.ListingUncheckedUpdateInput,
  Prisma.ListingWhereInput
> {
  constructor(private readonly db: DatabaseService) {
    super(db, (client) => client.listing);
  }

  // ------------------------------------------------------------------ search

  /** The `where` of a filtered search (live listings only). */
  whereOf(filter: ListingFilter): Prisma.ListingWhereInput {
    const and: Prisma.ListingWhereInput[] = [LIVE];
    const range = (min?: number, max?: number) =>
      min === undefined && max === undefined
        ? undefined
        : {
            ...(min !== undefined && { gte: min }),
            ...(max !== undefined && { lte: max }),
          };

    if (filter.purpose) and.push({ purpose: filter.purpose });
    if (filter.types?.length) and.push({ type: { in: filter.types } });
    if (filter.area) {
      and.push({ area: { equals: filter.area.trim(), mode: 'insensitive' } });
    }
    if (filter.compound) {
      and.push({
        compound: { equals: filter.compound.trim(), mode: 'insensitive' },
      });
    }
    const price = range(filter.priceMin, filter.priceMax);
    if (price) and.push({ price });
    const size = range(filter.sizeMin, filter.sizeMax);
    if (size) and.push({ sizeSqm: size });
    const floor = range(filter.floorMin, filter.floorMax);
    if (floor) and.push({ floor });
    if (filter.bedroomsMin !== undefined) {
      and.push({ bedrooms: { gte: filter.bedroomsMin } });
    }
    if (filter.bathroomsMin !== undefined) {
      and.push({ bathrooms: { gte: filter.bathroomsMin } });
    }
    if (filter.statuses.length) and.push({ status: { in: filter.statuses } });
    if (filter.adStatus) and.push({ adStatus: filter.adStatus });
    if (filter.assignedTo !== undefined) {
      and.push({ assignedToId: filter.assignedTo });
    }
    if (filter.checkInDue) {
      const due = {
        some: {
          kind: 'AD_CHECK_IN' as const,
          doneAt: null,
          dueAt: { lt: filter.checkInDue.before },
        },
      };
      and.push(
        filter.checkInDue.due
          ? { reminders: due }
          : { NOT: { reminders: due } },
      );
    }
    if (filter.search) {
      const text = {
        contains: escapeLike(filter.search.text),
        mode: 'insensitive' as const,
      };
      const or: Prisma.ListingWhereInput[] = [
        { area: text },
        { compound: text },
        { address: text },
        { description: text },
        { ownerName: text },
      ];
      if (filter.search.phoneDigits) {
        // Phones match only where the caller may see them: never another member's listing.
        or.push({
          ownerPhone: { contains: filter.search.phoneDigits },
          ...(filter.search.phoneMemberId !== null && {
            assignedToId: filter.search.phoneMemberId,
          }),
        });
      }
      and.push({ OR: or });
    }
    return { AND: and };
  }

  async findRows(
    where: Prisma.ListingWhereInput,
    orderBy: Prisma.ListingOrderByWithRelationInput[],
    skip: number,
    take: number,
  ): Promise<{ rows: ListingRowData[]; total: number }> {
    const [rows, total] = await Promise.all([
      this.db.listing.findMany({
        where,
        orderBy,
        skip,
        take,
        select: LISTING_ROW_SELECT,
      }),
      this.db.listing.count({ where }),
    ]);
    return { rows, total };
  }

  /** Up to `take` export rows (T11), in the search order. */
  findExportRows(
    where: Prisma.ListingWhereInput,
    orderBy: Prisma.ListingOrderByWithRelationInput[],
    take: number,
  ): Promise<ListingExportData[]> {
    return this.db.listing.findMany({
      where,
      orderBy,
      take,
      select: LISTING_EXPORT_SELECT,
    });
  }

  // ------------------------------------------------------------------ one listing

  findCore(id: string, tx?: Tx): Promise<ListingCore | null> {
    return (tx ?? this.db).listing.findFirst({
      where: { id, ...LIVE },
      select: CORE_SELECT,
    });
  }

  /**
   * The live listing, locked for the rest of the transaction: two changes to one listing (two
   * status changes, two photo registrations) run one after the other, so a rule checked here
   * ("no second take-down task", "at most 30 photos") holds.
   */
  async lockCore(tx: Tx, id: string): Promise<ListingCore | null> {
    await tx.$queryRaw`SELECT id FROM listings WHERE id = ${id}::uuid AND deleted_at IS NULL FOR UPDATE`;
    return this.findCore(id, tx);
  }

  findDetail(id: string, tx?: Tx): Promise<ListingDetailData | null> {
    return (tx ?? this.db).listing.findFirst({
      where: { id, ...LIVE },
      select: LISTING_DETAIL_SELECT,
    });
  }

  async createListing(
    tx: Tx,
    data: Prisma.ListingUncheckedCreateInput,
  ): Promise<{ id: string }> {
    return tx.listing.create({ data, select: { id: true } });
  }

  async updateFields(
    tx: Tx,
    id: string,
    data: Prisma.ListingUncheckedUpdateInput,
  ): Promise<void> {
    await tx.listing.update({
      where: { id, ...LIVE },
      data,
      select: { id: true },
    });
  }

  /** A live listing other than `exceptId` that has this owner phone. */
  async liveListingWithPhone(
    tx: Tx,
    phone: string,
    exceptId?: string,
  ): Promise<{ id: string } | null> {
    return tx.listing.findFirst({
      where: {
        ownerPhone: phone,
        ...LIVE,
        ...(exceptId && { id: { not: exceptId } }),
      },
      select: { id: true },
    });
  }

  /** True when the owner has a live listing other than `exceptId`. */
  async ownerHasLiveListing(
    tx: Tx,
    ownerId: string,
    exceptId?: string,
  ): Promise<boolean> {
    const row = await tx.listing.findFirst({
      where: {
        ownerId,
        ...LIVE,
        ...(exceptId && { id: { not: exceptId } }),
      },
      select: { id: true },
    });
    return row !== null;
  }

  /** True when the listing has an open reminder of this kind. */
  async hasOpenReminder(
    tx: Tx,
    listingId: string,
    kind: ReminderKind,
  ): Promise<boolean> {
    const row = await tx.reminder.findFirst({
      where: { listingId, kind, doneAt: null },
      select: { id: true },
    });
    return row !== null;
  }

  // ------------------------------------------------------------------ owners

  /**
   * A live owner within `scope` (an ownerScope fragment), locked for the transaction so two
   * listings can't be created from it at once.
   */
  async lockOwner(
    tx: Tx,
    id: string,
    scope: Prisma.OwnerWhereInput,
  ): Promise<ListingOwner | null> {
    await tx.$queryRaw`SELECT id FROM owners WHERE id = ${id}::uuid AND deleted_at IS NULL FOR UPDATE`;
    const row = await tx.owner.findFirst({
      where: { id, ...scope, ...LIVE },
      select: OWNER_SELECT,
    });
    return row ? toListingOwner(row) : null;
  }

  /** The owner (live or in the trash) holding this phone, if any. */
  async ownerWithPhone(tx: Tx, phone: string): Promise<ListingOwner | null> {
    const row = await tx.ownerPhone.findUnique({
      where: { phone },
      select: { owner: { select: OWNER_SELECT } },
    });
    return row ? toListingOwner(row.owner) : null;
  }

  /** Sets a live owner's lead status; `from` limits it to owners in that status. */
  async setOwnerStatus(
    tx: Tx,
    ownerId: string,
    status: LeadStatus,
    from?: LeadStatus,
  ): Promise<void> {
    await tx.owner.updateMany({
      where: { id: ownerId, ...LIVE, ...(from && { status: from }) },
      data: { status },
    });
  }

  // ------------------------------------------------------------------ restore

  /** The listing (trashed or not) with its owner's and member's state. */
  async findRestoreState(
    tx: Tx,
    id: string,
  ): Promise<ListingRestoreState | null> {
    return tx.listing.findUnique({
      where: { id },
      select: {
        ...CORE_SELECT,
        owner: { select: { deletedAt: true, assignedToId: true } },
        assignedTo: { select: { active: true } },
      },
    });
  }
}
