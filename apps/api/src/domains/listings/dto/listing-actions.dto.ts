import {
  AD_LINK_MAX_LENGTH,
  AdStatusSchema,
  LISTING_BULK_MAX,
  ListingStatusSchema,
  NOTE_BODY_MAX_LENGTH,
  type AdStatus,
  type ListingStatus,
} from '@prime-crm/shared';
import { Transform } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsDefined,
  IsIn,
  IsNotEmpty,
  IsString,
  IsUUID,
  MaxLength,
  ValidateIf,
} from 'class-validator';
import { trimString } from '../../../common/utils/query-list.util';
import { IsInstant } from '../../../common/validators/is-instant.validator';
import { IsWebUrl } from '../../../common/validators/is-web-url.validator';
import { IsOptionalNotNull } from '../../../common/validators/optional-not-null.validator';

/** `POST /listings/:id/status` (mirrors ListingStatusRequestSchema). */
export class ListingStatusDto {
  @IsIn(ListingStatusSchema.options)
  status!: ListingStatus;
}

/**
 * `PUT /listings/:id/ad` (mirrors UpdateAdRequestSchema). An omitted `link` keeps the stored
 * one; `null` clears it.
 */
export class UpdateAdDto {
  @ValidateIf(
    (_body: object, value: unknown) => value !== null && value !== undefined,
  )
  @IsString()
  @MaxLength(AD_LINK_MAX_LENGTH)
  @IsWebUrl(['http', 'https'])
  link?: string | null;

  @IsIn(AdStatusSchema.options)
  status!: AdStatus;

  @IsOptionalNotNull()
  @IsInstant()
  postedAt?: string;
}

/** `POST /listings/:id/ad/check-in` (mirrors AdCheckInRequestSchema). */
export class AdCheckInDto {
  @IsBoolean()
  stillAvailable!: boolean;

  /** Added to the listing's notes. */
  @IsOptionalNotNull()
  @Transform(({ value }: { value: unknown }) => trimString(value))
  @IsString()
  @IsNotEmpty()
  @MaxLength(NOTE_BODY_MAX_LENGTH)
  note?: string;
}

/** `POST /listings/assign` (mirrors AssignListingsRequestSchema). `assigneeId: null` = unassigned. */
export class AssignListingsDto {
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(LISTING_BULK_MAX)
  @IsUUID('all', { each: true })
  listingIds!: string[];

  @IsDefined()
  @ValidateIf((_body: object, value: unknown) => value !== null)
  @IsUUID()
  assigneeId!: string | null;
}
