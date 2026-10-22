import {
  FurnishingSchema,
  ListingPurposeSchema,
  PropertyTypeSchema,
  type Furnishing,
  type ListingPurpose,
  type PropertyType,
} from '@prime-crm/shared';
import { IsIn, ValidateIf } from 'class-validator';
import { IsOptionalNotNull } from '../../../common/validators/optional-not-null.validator';
import {
  IsAddress,
  IsArea,
  IsCompound,
  IsDescription,
  IsFloor,
  IsOwnerName,
  IsOwnerPhone,
  IsPrice,
  IsRooms,
  IsSize,
} from './listing-fields';

/** Optional, and `null` clears it. */
const Clearable = () =>
  ValidateIf(
    (_body: object, value: unknown) => value !== null && value !== undefined,
  );

/**
 * `PATCH /listings/:id` (mirrors UpdateListingRequestSchema): any create field except `ownerId`
 * and `assignedTo` (only assigners assign). Not a PartialType: optional fields take `null`.
 */
export class UpdateListingDto {
  @IsOptionalNotNull()
  @IsOwnerName()
  ownerName?: string;

  @IsOptionalNotNull()
  @IsOwnerPhone()
  ownerPhone?: string;

  @IsOptionalNotNull()
  @IsIn(ListingPurposeSchema.options)
  purpose?: ListingPurpose;

  @IsOptionalNotNull()
  @IsIn(PropertyTypeSchema.options)
  type?: PropertyType;

  @IsOptionalNotNull()
  @IsArea()
  area?: string;

  @Clearable()
  @IsCompound()
  compound?: string | null;

  @Clearable()
  @IsAddress()
  address?: string | null;

  @IsOptionalNotNull()
  @IsSize()
  sizeSqm?: number;

  @Clearable()
  @IsFloor()
  floor?: number | null;

  @Clearable()
  @IsRooms()
  bedrooms?: number | null;

  @Clearable()
  @IsRooms()
  bathrooms?: number | null;

  @IsOptionalNotNull()
  @IsPrice()
  price?: number;

  @Clearable()
  @IsIn(FurnishingSchema.options)
  furnishing?: Furnishing | null;

  @Clearable()
  @IsDescription()
  description?: string | null;
}
