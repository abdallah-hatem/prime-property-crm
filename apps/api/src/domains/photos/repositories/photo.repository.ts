import { Injectable } from '@nestjs/common';
import type { Photo, Prisma } from '@prisma/client';
import type { Tx } from '../../../common/interfaces/transaction.interface';
import {
  LIVE,
  SoftDeleteRepository,
} from '../../../common/repositories/soft-delete.repository';
import { DatabaseService } from '../../../database/database.service';

export const PHOTO_SELECT = { id: true, url: true, order: true } as const;
export type PhotoRow = Prisma.PhotoGetPayload<{ select: typeof PHOTO_SELECT }>;

const PHOTO_ORDER = [
  { order: 'asc' },
  { createdAt: 'asc' },
  { id: 'asc' },
] as const satisfies Prisma.PhotoOrderByWithRelationInput[];

@Injectable()
export class PhotoRepository extends SoftDeleteRepository<
  Photo,
  Prisma.PhotoUncheckedCreateInput,
  Prisma.PhotoUncheckedUpdateInput,
  Prisma.PhotoWhereInput
> {
  constructor(private readonly db: DatabaseService) {
    super(db, (client) => client.photo);
  }

  /** The listing's live photos in display order. */
  liveOf(tx: Tx, listingId: string): Promise<PhotoRow[]> {
    return tx.photo.findMany({
      where: { listingId, ...LIVE },
      orderBy: PHOTO_ORDER,
      select: PHOTO_SELECT,
    });
  }

  countLive(tx: Tx | undefined, listingId: string): Promise<number> {
    return (tx ?? this.db).photo.count({ where: { listingId, ...LIVE } });
  }

  /** The order after the last live photo (0 for the first). */
  async nextOrder(tx: Tx, listingId: string): Promise<number> {
    const { _max } = await tx.photo.aggregate({
      where: { listingId, ...LIVE },
      _max: { order: true },
    });
    return _max.order === null ? 0 : _max.order + 1;
  }

  findLiveByUrl(
    tx: Tx,
    listingId: string,
    url: string,
  ): Promise<PhotoRow | null> {
    return tx.photo.findFirst({
      where: { listingId, url, ...LIVE },
      select: PHOTO_SELECT,
    });
  }

  findLiveOfListing(
    tx: Tx,
    listingId: string,
    photoId: string,
  ): Promise<PhotoRow | null> {
    return tx.photo.findFirst({
      where: { id: photoId, listingId, ...LIVE },
      select: PHOTO_SELECT,
    });
  }

  createPhoto(
    tx: Tx,
    data: { listingId: string; url: string; pathname: string; order: number },
  ): Promise<PhotoRow> {
    return tx.photo.create({ data, select: PHOTO_SELECT });
  }

  /** Sets each photo's order to its index in `ids`. */
  async reorder(tx: Tx, ids: readonly string[]): Promise<void> {
    for (const [order, id] of ids.entries()) {
      await tx.photo.update({ where: { id }, data: { order } });
    }
  }

  async setOrder(tx: Tx, id: string, order: number): Promise<void> {
    await tx.photo.update({ where: { id }, data: { order } });
  }

  /** A photo (trashed or not) with whether its listing is in the trash. */
  findWithListing(
    tx: Tx,
    id: string,
  ): Promise<{
    listingId: string;
    listing: { deletedAt: Date | null };
  } | null> {
    return tx.photo.findUnique({
      where: { id },
      select: { listingId: true, listing: { select: { deletedAt: true } } },
    });
  }
}
