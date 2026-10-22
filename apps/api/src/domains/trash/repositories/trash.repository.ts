import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PAGE_LIMIT_MAX, type TrashKind } from '@prime-crm/shared';
import { DatabaseService } from '../../../database/database.service';
import type { Paginated } from '../../../common/interfaces/api-response.interface';
import type { Tx } from '../../../common/interfaces/transaction.interface';
import { listingLabel, photoLabel } from '../trash.pure';
import type { TrashedRecord } from '../interfaces/trash.interface';

const DELETED_BY = { select: { id: true, name: true } } as const;
const LISTING_LABEL_FIELDS = {
  type: true,
  bedrooms: true,
  area: true,
} as const;

const OWNER_SELECT = {
  id: true,
  name: true,
  deletedAt: true,
  deletedBy: DELETED_BY,
} satisfies Prisma.OwnerSelect;
const LISTING_SELECT = {
  id: true,
  ...LISTING_LABEL_FIELDS,
  deletedAt: true,
  deletedBy: DELETED_BY,
} satisfies Prisma.ListingSelect;
const PHOTO_SELECT = {
  id: true,
  order: true,
  listing: { select: LISTING_LABEL_FIELDS },
  deletedAt: true,
  deletedBy: DELETED_BY,
} satisfies Prisma.PhotoSelect;

type DeletedFilter =
  { deletedAt: null } | { deletedAt: Prisma.DateTimeNullableFilter };

interface Row {
  id: string;
  deletedAt: Date | null;
  deletedBy: { id: string; name: string } | null;
}

function toRecord(kind: TrashKind, row: Row, label: string): TrashedRecord {
  return {
    kind,
    id: row.id,
    label,
    // Only called for deleted rows (or right after marking one deleted).
    deletedAt: row.deletedAt ?? new Date(0),
    deletedBy: row.deletedBy,
  };
}

/**
 * Every soft-delete column write and every read of deleted rows for the three trashable
 * models. Domain repositories never see deleted rows (SoftDeleteRepository); this one only does.
 */
@Injectable()
export class TrashRepository {
  constructor(private readonly db: DatabaseService) {}

  /** One record of `kind` matching the deleted/live filter, with its label, or null. */
  private async findOne(
    client: Tx,
    kind: TrashKind,
    id: string,
    filter: DeletedFilter,
  ): Promise<TrashedRecord | null> {
    switch (kind) {
      case 'OWNER': {
        const row = await client.owner.findFirst({
          where: { id, ...filter },
          select: OWNER_SELECT,
        });
        return row && toRecord(kind, row, row.name);
      }
      case 'LISTING': {
        const row = await client.listing.findFirst({
          where: { id, ...filter },
          select: LISTING_SELECT,
        });
        return row && toRecord(kind, row, listingLabel(row));
      }
      case 'PHOTO': {
        const row = await client.photo.findFirst({
          where: { id, ...filter },
          select: PHOTO_SELECT,
        });
        return row && toRecord(kind, row, photoLabel(row));
      }
    }
  }

  /** A live (not deleted) record with its label. */
  findLive(tx: Tx, kind: TrashKind, id: string): Promise<TrashedRecord | null> {
    return this.findOne(tx, kind, id, { deletedAt: null });
  }

  /** A record in the trash (deletedAt set, whatever its age). */
  findDeleted(
    tx: Tx,
    kind: TrashKind,
    id: string,
  ): Promise<TrashedRecord | null> {
    return this.findOne(tx, kind, id, { deletedAt: { not: null } });
  }

  /** Sets deletedAt/deletedById on a live row; false when it was already gone or deleted. */
  async markDeleted(
    tx: Tx,
    kind: TrashKind,
    id: string,
    actorId: string,
    at: Date,
  ): Promise<boolean> {
    const args = {
      where: { id, deletedAt: null },
      data: { deletedAt: at, deletedById: actorId },
    };
    const { count } = await this.delegateUpdateMany(tx, kind, args);
    return count === 1;
  }

  /** Clears deletedAt on a deleted row; false when it was not in the trash any more. */
  async clearDeleted(tx: Tx, kind: TrashKind, id: string): Promise<boolean> {
    const args = {
      where: { id, deletedAt: { not: null } },
      data: { deletedAt: null, deletedById: null },
    };
    const { count } = await this.delegateUpdateMany(tx, kind, args);
    return count === 1;
  }

  private delegateUpdateMany(
    tx: Tx,
    kind: TrashKind,
    args: {
      where: { id: string } & DeletedFilter;
      data: { deletedAt: Date | null; deletedById: string | null };
    },
  ): Promise<{ count: number }> {
    switch (kind) {
      case 'OWNER':
        return tx.owner.updateMany(args);
      case 'LISTING':
        return tx.listing.updateMany(args);
      case 'PHOTO':
        return tx.photo.updateMany(args);
    }
  }

  /**
   * Trash rows deleted at or after `cutoff`, newest deletion first. With no `kind`, the three
   * tables are paged together: a UNION picks the page's ids, then each kind is hydrated.
   */
  async list(
    kind: TrashKind | undefined,
    cutoff: Date,
    page = 1,
    limit = PAGE_LIMIT_MAX,
  ): Promise<Paginated<TrashedRecord>> {
    const safePage = Math.max(1, Math.floor(page));
    const safeLimit = Math.min(Math.max(1, Math.floor(limit)), PAGE_LIMIT_MAX);
    const skip = (safePage - 1) * safeLimit;
    const inTrash = { deletedAt: { gte: cutoff } };
    const order = [{ deletedAt: 'desc' as const }, { id: 'desc' as const }];

    let data: TrashedRecord[];
    let total: number;
    switch (kind) {
      case 'OWNER': {
        const [rows, count] = await Promise.all([
          this.db.owner.findMany({
            where: inTrash,
            select: OWNER_SELECT,
            orderBy: order,
            skip,
            take: safeLimit,
          }),
          this.db.owner.count({ where: inTrash }),
        ]);
        data = rows.map((r) => toRecord('OWNER', r, r.name));
        total = count;
        break;
      }
      case 'LISTING': {
        const [rows, count] = await Promise.all([
          this.db.listing.findMany({
            where: inTrash,
            select: LISTING_SELECT,
            orderBy: order,
            skip,
            take: safeLimit,
          }),
          this.db.listing.count({ where: inTrash }),
        ]);
        data = rows.map((r) => toRecord('LISTING', r, listingLabel(r)));
        total = count;
        break;
      }
      case 'PHOTO': {
        const [rows, count] = await Promise.all([
          this.db.photo.findMany({
            where: inTrash,
            select: PHOTO_SELECT,
            orderBy: order,
            skip,
            take: safeLimit,
          }),
          this.db.photo.count({ where: inTrash }),
        ]);
        data = rows.map((r) => toRecord('PHOTO', r, photoLabel(r)));
        total = count;
        break;
      }
      case undefined:
        ({ data, total } = await this.listAllKinds(cutoff, skip, safeLimit));
        break;
    }

    return {
      data,
      total,
      page: safePage,
      limit: safeLimit,
      hasNextPage: safePage * safeLimit < total,
      hasPreviousPage: safePage > 1,
    };
  }

  private async listAllKinds(
    cutoff: Date,
    skip: number,
    take: number,
  ): Promise<{ data: TrashedRecord[]; total: number }> {
    const inTrash = { deletedAt: { gte: cutoff } };
    const [keys, owners, listings, photos] = await Promise.all([
      this.db.$queryRaw<{ kind: TrashKind; id: string }[]>(Prisma.sql`
        SELECT kind, id FROM (
          SELECT 'OWNER' AS kind, id::text AS id, deleted_at FROM owners WHERE deleted_at >= ${cutoff}
          UNION ALL
          SELECT 'LISTING', id::text, deleted_at FROM listings WHERE deleted_at >= ${cutoff}
          UNION ALL
          SELECT 'PHOTO', id::text, deleted_at FROM photos WHERE deleted_at >= ${cutoff}
        ) trash
        ORDER BY deleted_at DESC, id DESC
        OFFSET ${skip} LIMIT ${take}`),
      this.db.owner.count({ where: inTrash }),
      this.db.listing.count({ where: inTrash }),
      this.db.photo.count({ where: inTrash }),
    ]);

    const idsOf = (k: TrashKind) =>
      keys.filter((key) => key.kind === k).map((key) => key.id);
    const [ownerRows, listingRows, photoRows] = await Promise.all([
      this.db.owner.findMany({
        where: { id: { in: idsOf('OWNER') } },
        select: OWNER_SELECT,
      }),
      this.db.listing.findMany({
        where: { id: { in: idsOf('LISTING') } },
        select: LISTING_SELECT,
      }),
      this.db.photo.findMany({
        where: { id: { in: idsOf('PHOTO') } },
        select: PHOTO_SELECT,
      }),
    ]);

    const byKey = new Map<string, TrashedRecord>();
    for (const r of ownerRows)
      byKey.set(`OWNER:${r.id}`, toRecord('OWNER', r, r.name));
    for (const r of listingRows)
      byKey.set(`LISTING:${r.id}`, toRecord('LISTING', r, listingLabel(r)));
    for (const r of photoRows)
      byKey.set(`PHOTO:${r.id}`, toRecord('PHOTO', r, photoLabel(r)));

    const data = keys
      .map((key) => byKey.get(`${key.kind}:${key.id}`))
      .filter((record): record is TrashedRecord => record !== undefined);
    return { data, total: owners + listings + photos };
  }
}
