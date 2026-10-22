import { applyDecorators } from '@nestjs/common';
import {
  ADDRESS_MAX_LENGTH,
  AREA_MAX_LENGTH,
  COMPOUND_MAX_LENGTH,
  LISTING_DESCRIPTION_MAX_LENGTH,
  LISTING_FLOOR_MAX,
  LISTING_FLOOR_MIN,
  LISTING_PRICE_MAX,
  LISTING_PRICE_MIN,
  LISTING_ROOMS_MAX,
  LISTING_SIZE_MAX,
  LISTING_SIZE_MIN,
  OWNER_NAME_MAX_LENGTH,
  PHONE_INPUT_MAX_LENGTH,
} from '@prime-crm/shared';
import { Transform } from 'class-transformer';
import {
  IsInt,
  IsNotEmpty,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import { trimString } from '../../../common/utils/query-list.util';
import { IsPhone } from '../../../common/validators/is-phone.validator';

/**
 * Field validators shared by the create and update DTOs, mirroring the shared listing schemas.
 * Whole numbers use `@IsInt()`: Prisma would silently truncate 1500.5 to 1500 (LEARNINGS).
 */
const text = (max: number) =>
  applyDecorators(
    Transform(({ value }: { value: unknown }) => trimString(value)),
    IsString(),
    IsNotEmpty(),
    MaxLength(max),
  );

const int = (min: number, max: number) =>
  applyDecorators(IsInt(), Min(min), Max(max));

export const IsOwnerName = () => text(OWNER_NAME_MAX_LENGTH);
export const IsOwnerPhone = () =>
  applyDecorators(
    IsString(),
    MaxLength(PHONE_INPUT_MAX_LENGTH),
    IsPhone() as PropertyDecorator,
  );
export const IsArea = () => text(AREA_MAX_LENGTH);
export const IsCompound = () => text(COMPOUND_MAX_LENGTH);
export const IsAddress = () => text(ADDRESS_MAX_LENGTH);
export const IsDescription = () => text(LISTING_DESCRIPTION_MAX_LENGTH);
export const IsPrice = () => int(LISTING_PRICE_MIN, LISTING_PRICE_MAX);
export const IsSize = () => int(LISTING_SIZE_MIN, LISTING_SIZE_MAX);
export const IsFloor = () => int(LISTING_FLOOR_MIN, LISTING_FLOOR_MAX);
export const IsRooms = () => int(0, LISTING_ROOMS_MAX);
