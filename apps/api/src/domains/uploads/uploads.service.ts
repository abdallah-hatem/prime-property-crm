import { BadRequestException, Injectable } from '@nestjs/common';
import {
  ListingPhotoUploadPayloadSchema,
  PHOTO_CONTENT_TYPES,
  PHOTO_MAX_BYTES,
  PhotoErrorCode,
} from '@prime-crm/shared';
import type { IncomingMessage } from 'node:http';
import type { CurrentUser } from '../../common/interfaces/current-user.interface';
import { ListingsService } from '../listings/listings.service';
import { BlobConfig } from './blob.config';
import {
  BlobUploadGateway,
  type UploadTokenResult,
} from './blob-upload.gateway';
import type { ListingPhotoUploadDto } from './dto/listing-photo-upload.dto';
import { uploadsNotConfigured } from './upload.errors';
import { uploadRefusal } from './uploads.pure';

function refused(message: string): BadRequestException {
  return new BadRequestException({
    message,
    error: PhotoErrorCode.UPLOAD_REFUSED,
  });
}

/**
 * The Vercel Blob client-upload handshake for listing photos: checks the caller may change the
 * listing named in `clientPayload` and that the file goes into that listing's folder, then
 * signs a short-lived token for JPEG, PNG or WebP up to 10 MB. The file itself never passes
 * through the API; `POST /listings/:id/photos` registers it afterwards.
 */
@Injectable()
export class UploadsService {
  constructor(
    private readonly listings: ListingsService,
    private readonly blob: BlobConfig,
    private readonly gateway: BlobUploadGateway,
  ) {}

  async listingPhotoToken(
    dto: ListingPhotoUploadDto,
    request: IncomingMessage,
    user: CurrentUser,
  ): Promise<UploadTokenResult> {
    const token = this.blob.token();
    if (!token) throw uploadsNotConfigured();
    const payload = parsePayload(dto.payload.clientPayload);
    if (!payload)
      throw refused('clientPayload must be {"listingId": "<uuid>"}');
    await this.listings.assertManageable(payload.listingId, user);

    const problem = uploadRefusal(dto.payload.pathname, payload.listingId);
    if (problem) throw refused(problem);

    return this.gateway.issueToken({
      token,
      request,
      body: {
        type: 'blob.generate-client-token',
        payload: {
          pathname: dto.payload.pathname,
          clientPayload: dto.payload.clientPayload ?? null,
          multipart: dto.payload.multipart ?? false,
        },
      },
      options: () =>
        Promise.resolve({
          allowedContentTypes: [...PHOTO_CONTENT_TYPES],
          maximumSizeInBytes: PHOTO_MAX_BYTES,
          addRandomSuffix: true,
          tokenPayload: JSON.stringify({ listingId: payload.listingId }),
        }),
    });
  }
}

function parsePayload(raw: string | null | undefined) {
  if (!raw) return null;
  try {
    const parsed = ListingPhotoUploadPayloadSchema.safeParse(JSON.parse(raw));
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}
