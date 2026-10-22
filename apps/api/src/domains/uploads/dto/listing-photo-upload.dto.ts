import { PHOTO_PATHNAME_MAX_LENGTH } from '@prime-crm/shared';
import { Type } from 'class-transformer';
import {
  IsBoolean,
  IsDefined,
  IsIn,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
  ValidateNested,
} from 'class-validator';

class UploadTokenPayloadDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(PHOTO_PATHNAME_MAX_LENGTH)
  pathname!: string;

  /** JSON of `{ listingId }`; parsed and checked by the service. */
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  clientPayload?: string | null;

  @IsOptional()
  @IsBoolean()
  multipart?: boolean;
}

/**
 * `POST /uploads/listing-photo`: the token request `upload()` from `@vercel/blob/client` sends
 * (mirrors ListingPhotoUploadRequestSchema). Upload-completed callbacks are not used.
 */
export class ListingPhotoUploadDto {
  @IsIn(['blob.generate-client-token'])
  type!: 'blob.generate-client-token';

  @IsDefined()
  @ValidateNested()
  @Type(() => UploadTokenPayloadDto)
  payload!: UploadTokenPayloadDto;
}
