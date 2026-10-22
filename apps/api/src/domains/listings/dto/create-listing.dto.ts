import {
  FurnishingSchema,
  ListingPurposeSchema,
  PropertyTypeSchema,
  type Furnishing,
  type ListingPurpose,
  type PropertyType,
} from '@prime-crm/shared';
import {
  IsIn,
  IsUUID,
  Validate,
  ValidateIf,
  ValidatorConstraint,
  type ValidationArguments,
  type ValidatorConstraintInterface,
} from 'class-validator';
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

/** Either `ownerId`, or `ownerName` and `ownerPhone`; never both. */
@ValidatorConstraint({ name: 'ownerOrContact' })
class OwnerOrContact implements ValidatorConstraintInterface {
  validate(_value: unknown, args: ValidationArguments): boolean {
    const body = args.object as CreateListingDto;
    return body.ownerId !== undefined
      ? body.ownerName === undefined && body.ownerPhone === undefined
      : body.ownerName !== undefined && body.ownerPhone !== undefined;
  }

  defaultMessage(): string {
    return 'give either ownerId, or ownerName and ownerPhone';
  }
}

const usesContact = (body: CreateListingDto) =>
  body.ownerName !== undefined || body.ownerPhone !== undefined;

/**
 * `POST /listings` (mirrors CreateListingRequestSchema). From an owner (`ownerId`) or direct
 * (`ownerName` + `ownerPhone`, needs listings.create). `assignedTo` needs owners.assign.
 */
export class CreateListingDto {
  @ValidateIf(
    (body: CreateListingDto) =>
      body.ownerId !== undefined || !usesContact(body),
  )
  @Validate(OwnerOrContact)
  @IsUUID()
  ownerId?: string;

  @ValidateIf(
    (body: CreateListingDto) =>
      body.ownerId === undefined || body.ownerName !== undefined,
  )
  @Validate(OwnerOrContact)
  @IsOwnerName()
  ownerName?: string;

  @ValidateIf(
    (body: CreateListingDto) =>
      body.ownerId === undefined || body.ownerPhone !== undefined,
  )
  @Validate(OwnerOrContact)
  @IsOwnerPhone()
  ownerPhone?: string;

  @IsIn(ListingPurposeSchema.options)
  purpose!: ListingPurpose;

  @IsIn(PropertyTypeSchema.options)
  type!: PropertyType;

  @IsArea()
  area!: string;

  @IsOptionalNotNull()
  @IsCompound()
  compound?: string;

  @IsOptionalNotNull()
  @IsAddress()
  address?: string;

  @IsSize()
  sizeSqm!: number;

  @IsOptionalNotNull()
  @IsFloor()
  floor?: number;

  @IsOptionalNotNull()
  @IsRooms()
  bedrooms?: number;

  @IsOptionalNotNull()
  @IsRooms()
  bathrooms?: number;

  @IsPrice()
  price!: number;

  @IsOptionalNotNull()
  @IsIn(FurnishingSchema.options)
  furnishing?: Furnishing;

  @IsOptionalNotNull()
  @IsDescription()
  description?: string;

  /** Needs owners.assign (the service answers 403 otherwise). */
  @IsOptionalNotNull()
  @IsUUID()
  assignedTo?: string;
}
