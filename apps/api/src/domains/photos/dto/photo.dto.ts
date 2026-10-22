import {
  LISTING_PHOTOS_MAX,
  PHOTO_PATHNAME_MAX_LENGTH,
  PHOTO_URL_MAX_LENGTH,
} from '@prime-crm/shared';
import {
  ArrayMaxSize,
  ArrayMinSize,
  ArrayUnique,
  IsArray,
  IsNotEmpty,
  IsString,
  IsUUID,
  MaxLength,
} from 'class-validator';
import { IsWebUrl } from '../../../common/validators/is-web-url.validator';

/** `POST /listings/:id/photos` (mirrors RegisterPhotoRequestSchema). */
export class RegisterPhotoDto {
  @IsString()
  @MaxLength(PHOTO_URL_MAX_LENGTH)
  @IsWebUrl(['https'])
  url!: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(PHOTO_PATHNAME_MAX_LENGTH)
  pathname!: string;
}

/** `PUT /listings/:id/photos/order` (mirrors ReorderPhotosRequestSchema). */
export class ReorderPhotosDto {
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(LISTING_PHOTOS_MAX)
  @ArrayUnique()
  @IsUUID('all', { each: true })
  photoIds!: string[];
}
