import {
  BadRequestException,
  ConflictException,
  Injectable,
} from '@nestjs/common';
import {
  LISTING_PHOTOS_MAX,
  PhotoErrorCode,
  TrashErrorCode,
  type Photo,
} from '@prime-crm/shared';
import type { CurrentUser } from '../../common/interfaces/current-user.interface';
import type { Tx } from '../../common/interfaces/transaction.interface';
import { assertFound } from '../../common/utils/ownership.util';
import { DatabaseService } from '../../database/database.service';
import { ListingsService } from '../listings/listings.service';
import { TrashService } from '../trash/trash.service';
import { BlobConfig } from '../uploads/blob.config';
import { uploadsNotConfigured } from '../uploads/upload.errors';
import type { RegisterPhotoDto, ReorderPhotosDto } from './dto/photo.dto';
import { isSameSet, photoUrlProblem } from './photos.pure';
import { PhotoRepository } from './repositories/photo.repository';

function tooManyPhotos(): ConflictException {
  return new ConflictException({
    message: `A listing holds at most ${LISTING_PHOTOS_MAX} photos`,
    error: PhotoErrorCode.TOO_MANY_PHOTOS,
  });
}

/**
 * A listing's photos: register an uploaded file, reorder, delete (to the trash). Every change
 * needs the listing assigned to the caller or listings.manageAll (403), on a locked listing so
 * two uploads at once can't pass the 30-photo limit together.
 */
@Injectable()
export class PhotosService {
  constructor(
    private readonly db: DatabaseService,
    private readonly photos: PhotoRepository,
    private readonly listings: ListingsService,
    private readonly trash: TrashService,
    private readonly blob: BlobConfig,
  ) {}

  /** Live photos of a listing; refuses when it already holds the maximum. */
  async assertRoom(tx: Tx | undefined, listingId: string): Promise<void> {
    if ((await this.photos.countLive(tx, listingId)) >= LISTING_PHOTOS_MAX) {
      throw tooManyPhotos();
    }
  }

  /**
   * Registers a file uploaded to our Blob store (400 PHOTO_URL_INVALID for anything else) as
   * the listing's last photo. Registering the same URL again returns the photo already made.
   */
  async register(
    listingId: string,
    dto: RegisterPhotoDto,
    user: CurrentUser,
  ): Promise<Photo> {
    const hosts = this.blob.hosts();
    if (!hosts.length) throw uploadsNotConfigured();
    return this.db.transaction(async (tx) => {
      await this.listings.lockManageable(tx, listingId, user);
      const problem = photoUrlProblem(dto.url, dto.pathname, listingId, hosts);
      if (problem) {
        throw new BadRequestException({
          message: problem,
          error: PhotoErrorCode.PHOTO_URL_INVALID,
        });
      }
      const existing = await this.photos.findLiveByUrl(tx, listingId, dto.url);
      if (existing) return existing;
      await this.assertRoom(tx, listingId);
      return this.photos.createPhoto(tx, {
        listingId,
        url: dto.url,
        pathname: dto.pathname,
        order: await this.photos.nextOrder(tx, listingId),
      });
    });
  }

  /** New display order: `photoIds` must be every live photo of the listing, once each. */
  async reorder(
    listingId: string,
    dto: ReorderPhotosDto,
    user: CurrentUser,
  ): Promise<Photo[]> {
    return this.db.transaction(async (tx) => {
      await this.listings.lockManageable(tx, listingId, user);
      const current = await this.photos.liveOf(tx, listingId);
      if (
        !isSameSet(
          dto.photoIds,
          current.map((p) => p.id),
        )
      ) {
        throw new BadRequestException({
          message: 'List every photo of the listing exactly once',
          error: PhotoErrorCode.PHOTO_SET_MISMATCH,
        });
      }
      await this.photos.reorder(tx, dto.photoIds);
      return this.photos.liveOf(tx, listingId);
    });
  }

  /** To the trash (the Blob file stays until the purge); TrashService logs the DELETE. */
  async remove(
    listingId: string,
    photoId: string,
    user: CurrentUser,
  ): Promise<void> {
    await this.db.transaction(async (tx) => {
      await this.listings.lockManageable(tx, listingId, user);
      assertFound(
        await this.photos.findLiveOfListing(tx, listingId, photoId),
        'Photo',
      );
      await this.trash.softDelete(tx, 'PHOTO', photoId, user.id);
    });
  }

  // ------------------------------------------------------------------ restore

  /** A photo comes back only after its listing, and only while the listing has room. */
  async validateRestore(tx: Tx, photoId: string): Promise<void> {
    const photo = await this.photos.findWithListing(tx, photoId);
    if (!photo) return;
    if (photo.listing.deletedAt) {
      throw new ConflictException({
        message: 'Restore the listing first',
        error: TrashErrorCode.PARENT_DELETED,
      });
    }
    if (
      (await this.photos.countLive(tx, photo.listingId)) >= LISTING_PHOTOS_MAX
    ) {
      throw new ConflictException({
        message: `The listing already has ${LISTING_PHOTOS_MAX} photos`,
        error: TrashErrorCode.TOO_MANY_PHOTOS,
      });
    }
  }

  /** A restored photo goes to the end of the listing's photos. */
  async afterRestore(tx: Tx, photoId: string): Promise<void> {
    const photo = await this.photos.findWithListing(tx, photoId);
    if (!photo) return;
    // nextOrder counts this photo too (it is live again): it lands after itself, which is last.
    await this.photos.setOrder(
      tx,
      photoId,
      await this.photos.nextOrder(tx, photo.listingId),
    );
  }
}
