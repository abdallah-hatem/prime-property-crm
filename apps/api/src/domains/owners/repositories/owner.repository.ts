import { Injectable } from '@nestjs/common';
import { Prisma, type LeadStatus, type Owner } from '@prisma/client';
import type { Tx } from '../../../common/interfaces/transaction.interface';
import {
  LIVE,
  SoftDeleteRepository,
} from '../../../common/repositories/soft-delete.repository';
import { escapeLike } from '../../../common/utils/like.util';
import { DatabaseService } from '../../../database/database.service';
import { CALL_SELECT, type CallRow } from '../../calls/call.shape';
import type {
  OwnerFilter,
  TimelineKind,
  TimelineRef,
} from '../interfaces/owner.interface';
import { CALLING_STATUS_ORDER, NEVER_IN_CALLING_LIST } from '../owners.pure';

/** The columns behind `OwnerRow`. */
export const OWNER_ROW_SELECT = {
  id: true,
  name: true,
  area: true,
  status: true,
  createdAt: true,
  assignedTo: { select: { id: true, name: true } },
  phones: { select: { phone: true }, orderBy: { position: 'asc' } },
  calls: {
    where: { outcomeId: { not: null } },
    orderBy: [{ startedAt: 'desc' }, { id: 'desc' }],
    take: 1,
    select: {
      startedAt: true,
      outcome: { select: { id: true, labelEn: true, labelAr: true } },
    },
  },
  reminders: {
    where: { doneAt: null },
    orderBy: { dueAt: 'asc' },
    take: 1,
    select: { dueAt: true },
  },
} as const satisfies Prisma.OwnerSelect;

/** `Owner` = the row plus its source import and its live listing. */
export const OWNER_DETAIL_SELECT = {
  ...OWNER_ROW_SELECT,
  sourceImport: { select: { id: true, fileName: true } },
  listings: { where: LIVE, select: { id: true }, take: 1 },
} as const satisfies Prisma.OwnerSelect;

export type OwnerRowData = Prisma.OwnerGetPayload<{
  select: typeof OWNER_ROW_SELECT;
}>;
export type OwnerDetailData = Prisma.OwnerGetPayload<{
  select: typeof OWNER_DETAIL_SELECT;
}>;

/** The fields access checks and status rules need. */
export interface OwnerCore {
  id: string;
  name: string;
  status: LeadStatus;
  assignedToId: string | null;
}

const CORE_SELECT = {
  id: true,
  name: true,
  status: true,
  assignedToId: true,
} as const;

/** Who already holds a phone: an owner (live or trashed) or a live listing. */
export interface PhoneHolder {
  phone: string;
  ownerId?: string;
  ownerDeleted?: boolean;
  listingId?: string;
  /** For a listing: the owner it is linked to (its phone is that owner's own). */
  linkedOwnerId?: string | null;
}

export interface AssignmentRow {
  id: string;
  createdAt: Date;
  fromMember: { id: string; name: string } | null;
  toMember: { id: string; name: string } | null;
  by: { id: string; name: string };
}

/** A timestamp parameter for raw SQL against `timestamp(3)` (UTC) columns. */
const ts = (at: Date) => Prisma.sql`${at.toISOString()}::timestamp`;

@Injectable()
export class OwnerRepository extends SoftDeleteRepository<
  Owner,
  Prisma.OwnerUncheckedCreateInput,
  Prisma.OwnerUncheckedUpdateInput,
  Prisma.OwnerWhereInput
> {
  constructor(private readonly db: DatabaseService) {
    super(db, (client) => client.owner);
  }

  /** The `where` of a filtered owner list (live owners only). */
  whereOf(filter: OwnerFilter): Prisma.OwnerWhereInput {
    const and: Prisma.OwnerWhereInput[] = [LIVE];
    if (filter.memberId !== undefined) {
      and.push({ assignedToId: filter.memberId });
    } else if (filter.assignedTo !== undefined) {
      and.push({ assignedToId: filter.assignedTo });
    }
    if (filter.statuses?.length) and.push({ status: { in: filter.statuses } });
    if (filter.area) {
      and.push({ area: { equals: filter.area.trim(), mode: 'insensitive' } });
    }
    if (filter.importId) and.push({ sourceImportId: filter.importId });
    if (filter.hasReminder !== undefined) {
      const open = { some: { doneAt: null } };
      and.push(
        filter.hasReminder ? { reminders: open } : { NOT: { reminders: open } },
      );
    }
    if (filter.search) {
      const or: Prisma.OwnerWhereInput[] = [
        {
          name: {
            contains: escapeLike(filter.search.text),
            mode: 'insensitive',
          },
        },
      ];
      if (filter.search.phoneDigits) {
        or.push({
          phones: { some: { phone: { contains: filter.search.phoneDigits } } },
        });
      }
      and.push({ OR: or });
    }
    return { AND: and };
  }

  async findRows(
    where: Prisma.OwnerWhereInput,
    orderBy: Prisma.OwnerOrderByWithRelationInput[],
    skip: number,
    take: number,
  ): Promise<{ rows: OwnerRowData[]; total: number }> {
    const [rows, total] = await Promise.all([
      this.db.owner.findMany({
        where,
        orderBy,
        skip,
        take,
        select: OWNER_ROW_SELECT,
      }),
      this.db.owner.count({ where }),
    ]);
    return { rows, total };
  }

  async findIds(
    where: Prisma.OwnerWhereInput,
    orderBy: Prisma.OwnerOrderByWithRelationInput[],
    take: number,
  ): Promise<{ ids: string[]; total: number }> {
    const [rows, total] = await Promise.all([
      this.db.owner.findMany({ where, orderBy, take, select: { id: true } }),
      this.db.owner.count({ where }),
    ]);
    return { ids: rows.map((r) => r.id), total };
  }

  /** Rows for these ids, in the order given. */
  async findRowsByIds(ids: string[]): Promise<OwnerRowData[]> {
    if (ids.length === 0) return [];
    const rows = await this.db.owner.findMany({
      where: { id: { in: ids } },
      select: OWNER_ROW_SELECT,
    });
    const byId = new Map(rows.map((r) => [r.id, r]));
    return ids.flatMap((id) => byId.get(id) ?? []);
  }

  /** A live owner within `scope` (an ownerScope fragment), with the fields rules need. */
  findCore(
    id: string,
    scope: Prisma.OwnerWhereInput,
    tx?: Tx,
  ): Promise<OwnerCore | null> {
    return (tx ?? this.db).owner.findFirst({
      where: { id, ...scope, ...LIVE },
      select: CORE_SELECT,
    });
  }

  findDetail(id: string, tx?: Tx): Promise<OwnerDetailData | null> {
    return (tx ?? this.db).owner.findFirst({
      where: { id, ...LIVE },
      select: OWNER_DETAIL_SELECT,
    });
  }

  /**
   * The calling list of `memberId`: own, live, not Listed or Do not call. Buckets: an overdue
   * reminder (open, due before `now`), a reminder due later today (before `todayEnd`), then
   * the lead statuses in CALLING_STATUS_ORDER. Within a bucket: never called first, then the
   * one called longest ago, ties by created date (oldest first).
   */
  async callingListIds(
    memberId: string,
    now: Date,
    todayEnd: Date,
    skip: number,
    take: number,
  ): Promise<{ ids: string[]; total: number }> {
    const statusRank = Prisma.join(
      CALLING_STATUS_ORDER.map(
        (status, i) => Prisma.sql`WHEN ${status} THEN ${i + 2}`,
      ),
      ' ',
    );
    const excluded = Prisma.join(
      NEVER_IN_CALLING_LIST.map((s) => Prisma.sql`${s}`),
    );
    const scope = Prisma.sql`
      FROM owners o
      WHERE o.assigned_to_id = ${memberId}::uuid
        AND o.deleted_at IS NULL
        AND o.status::text NOT IN (${excluded})`;

    const rows = await this.db.$queryRaw<{ id: string }[]>`
      SELECT o.id::text AS id
      ${scope}
      ORDER BY
        CASE
          WHEN EXISTS (SELECT 1 FROM reminders r
                       WHERE r.owner_id = o.id AND r.done_at IS NULL AND r.due_at < ${ts(now)}) THEN 0
          WHEN EXISTS (SELECT 1 FROM reminders r
                       WHERE r.owner_id = o.id AND r.done_at IS NULL
                         AND r.due_at >= ${ts(now)} AND r.due_at < ${ts(todayEnd)}) THEN 1
          ELSE CASE o.status::text ${statusRank} ELSE 99 END
        END,
        o.last_call_at ASC NULLS FIRST,
        o.created_at ASC,
        o.id ASC
      LIMIT ${take} OFFSET ${skip}`;
    const [{ total }] = await this.db.$queryRaw<{ total: number }[]>`
      SELECT count(*)::int AS total ${scope}`;
    return { ids: rows.map((r) => r.id), total };
  }

  /**
   * Holders of any of these E.164 phones: owners (live or in the trash: a trashed owner keeps
   * its phones until purged) and live listings.
   */
  async phoneHolders(tx: Tx, phones: string[]): Promise<PhoneHolder[]> {
    if (phones.length === 0) return [];
    const ownerPhones = await tx.ownerPhone.findMany({
      where: { phone: { in: phones } },
      select: { phone: true, owner: { select: { id: true, deletedAt: true } } },
    });
    const listings = await tx.listing.findMany({
      where: { ownerPhone: { in: phones }, ...LIVE },
      select: { id: true, ownerPhone: true, ownerId: true },
    });
    return [
      ...ownerPhones.map((p) => ({
        phone: p.phone,
        ownerId: p.owner.id,
        ownerDeleted: p.owner.deletedAt !== null,
      })),
      ...listings.map((l) => ({
        phone: l.ownerPhone,
        listingId: l.id,
        linkedOwnerId: l.ownerId,
      })),
    ];
  }

  async createWithPhones(
    tx: Tx,
    data: Omit<Prisma.OwnerUncheckedCreateInput, 'phones'>,
    phones: string[],
  ): Promise<{ id: string }> {
    return tx.owner.create({
      data: {
        ...data,
        phones: {
          create: phones.map((phone, position) => ({ phone, position })),
        },
      },
      select: { id: true },
    });
  }

  async updateFields(
    tx: Tx,
    id: string,
    data: Prisma.OwnerUncheckedUpdateInput,
  ): Promise<void> {
    await tx.owner.update({
      where: { id, ...LIVE },
      data,
      select: { id: true },
    });
  }

  /** Replaces the owner's phones with `phones`, in that order. */
  async replacePhones(
    tx: Tx,
    ownerId: string,
    phones: string[],
  ): Promise<void> {
    await tx.ownerPhone.deleteMany({ where: { ownerId } });
    await tx.ownerPhone.createMany({
      data: phones.map((phone, position) => ({ ownerId, phone, position })),
    });
  }

  async hasLiveListing(tx: Tx, ownerId: string): Promise<boolean> {
    const listing = await tx.listing.findFirst({
      where: { ownerId, ...LIVE },
      select: { id: true },
    });
    return listing !== null;
  }

  /** Status and assignee state of a just-restored owner (read inside the restore). */
  findRestoreState(
    tx: Tx,
    id: string,
  ): Promise<{
    status: LeadStatus;
    assignedTo: { id: string; active: boolean } | null;
    listings: { id: string }[];
  } | null> {
    return tx.owner.findUnique({
      where: { id },
      select: {
        status: true,
        assignedTo: { select: { id: true, active: true } },
        listings: { where: LIVE, select: { id: true }, take: 1 },
      },
    });
  }

  /** One page of the owner's timeline: calls, notes, reminders, assignments, newest first. */
  async timelinePage(
    ownerId: string,
    skip: number,
    take: number,
  ): Promise<{ refs: TimelineRef[]; total: number }> {
    const id = Prisma.sql`${ownerId}::uuid`;
    const rows = await this.db.$queryRaw<
      { kind: TimelineKind; id: string; at: Date }[]
    >`
      SELECT kind, id::text AS id, at FROM (
        SELECT 'CALL' AS kind, c.id, c.started_at AS at FROM calls c WHERE c.owner_id = ${id}
        UNION ALL
        SELECT 'NOTE', n.id, n.created_at FROM notes n WHERE n.owner_id = ${id}
        UNION ALL
        SELECT 'REMINDER', r.id, r.created_at FROM reminders r WHERE r.owner_id = ${id}
        UNION ALL
        SELECT 'ASSIGN', a.id, a.created_at FROM owner_assignments a WHERE a.owner_id = ${id}
      ) t
      ORDER BY at DESC, id DESC
      LIMIT ${take} OFFSET ${skip}`;
    const [{ total }] = await this.db.$queryRaw<{ total: number }[]>`
      SELECT (
        (SELECT count(*) FROM calls WHERE owner_id = ${id}) +
        (SELECT count(*) FROM notes WHERE owner_id = ${id}) +
        (SELECT count(*) FROM reminders WHERE owner_id = ${id}) +
        (SELECT count(*) FROM owner_assignments WHERE owner_id = ${id})
      )::int AS total`;
    return { refs: rows, total };
  }

  findCallsByIds(ids: string[]): Promise<CallRow[]> {
    if (ids.length === 0) return Promise.resolve([]);
    return this.db.call.findMany({
      where: { id: { in: ids } },
      select: CALL_SELECT,
    });
  }

  findAssignmentsByIds(ids: string[]): Promise<AssignmentRow[]> {
    if (ids.length === 0) return Promise.resolve([]);
    return this.db.ownerAssignment.findMany({
      where: { id: { in: ids } },
      select: {
        id: true,
        createdAt: true,
        fromMember: { select: { id: true, name: true } },
        toMember: { select: { id: true, name: true } },
        by: { select: { id: true, name: true } },
      },
    });
  }
}
