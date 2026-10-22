import {
  AdStatusSchema,
  AREA_MAX_LENGTH,
  COMPOUND_MAX_LENGTH,
  LISTING_FLOOR_MAX,
  LISTING_FLOOR_MIN,
  LISTING_PRICE_MAX,
  LISTING_ROOMS_MAX,
  LISTING_SIZE_MAX,
  ListingPurposeSchema,
  ListingSortSchema,
  ListingStatusSchema,
  PropertyTypeSchema,
  SEARCH_MAX_LENGTH,
  type AdStatus,
  type ListingPurpose,
  type ListingSort,
  type ListingStatus,
  type PropertyType,
} from '@prime-crm/shared';
import { applyDecorators } from '@nestjs/common';
import { Transform, Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
  ValidatorConstraint,
  Validate,
  type ValidationArguments,
  type ValidatorConstraintInterface,
} from 'class-validator';
import { PaginationQueryDto } from '../../../common/dto/pagination-query.dto';
import { toBoolean, toList } from '../../../common/utils/query-list.util';

const UUID_OR_KEYWORD =
  /^(me|unassigned|[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})$/i;

const intParam = (min: number, max: number) =>
  applyDecorators(
    IsOptional(),
    Type(() => Number),
    IsInt(),
    Min(min),
    Max(max),
  );

/** A `*Max` must not be below its `*Min` (constraints[0] names the min field). */
@ValidatorConstraint({ name: 'notBelowMin' })
class NotBelowMin implements ValidatorConstraintInterface {
  validate(value: unknown, args: ValidationArguments): boolean {
    const min = (args.object as Record<string, unknown>)[
      args.constraints[0] as string
    ];
    return typeof value !== 'number' || typeof min !== 'number' || min <= value;
  }

  defaultMessage(args: ValidationArguments): string {
    return `${args.property} must not be below ${String(args.constraints[0])}`;
  }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- TS requires any[] for a mixin base constructor
type Constructor = new (...args: any[]) => object;

/**
 * Adds the `GET /listings` filters to a base DTO, so the search (with paging) and the listings
 * export (T11) share one definition. Mirrors ListingListQuerySchema.
 */
export function withListingFilters<TBase extends Constructor>(Base: TBase) {
  class ListingFilters extends Base {
    @IsOptional()
    @IsIn(ListingPurposeSchema.options)
    purpose?: ListingPurpose;

    /** `?type=VILLA&type=STUDIO` or `?type=VILLA,STUDIO`. */
    @IsOptional()
    @Transform(({ value }) => toList(value))
    @IsArray()
    @ArrayMaxSize(PropertyTypeSchema.options.length)
    @IsIn(PropertyTypeSchema.options, { each: true })
    type?: PropertyType[];

    @IsOptional()
    @IsString()
    @MaxLength(AREA_MAX_LENGTH)
    area?: string;

    @IsOptional()
    @IsString()
    @MaxLength(COMPOUND_MAX_LENGTH)
    compound?: string;

    @intParam(0, LISTING_PRICE_MAX)
    priceMin?: number;

    @intParam(0, LISTING_PRICE_MAX)
    @Validate(NotBelowMin, ['priceMin'])
    priceMax?: number;

    @intParam(0, LISTING_SIZE_MAX)
    sizeMin?: number;

    @intParam(0, LISTING_SIZE_MAX)
    @Validate(NotBelowMin, ['sizeMin'])
    sizeMax?: number;

    @intParam(0, LISTING_ROOMS_MAX)
    bedroomsMin?: number;

    @intParam(0, LISTING_ROOMS_MAX)
    bathroomsMin?: number;

    @intParam(LISTING_FLOOR_MIN, LISTING_FLOOR_MAX)
    floorMin?: number;

    @intParam(LISTING_FLOOR_MIN, LISTING_FLOOR_MAX)
    @Validate(NotBelowMin, ['floorMin'])
    floorMax?: number;

    /** Defaults to AVAILABLE. */
    @IsOptional()
    @Transform(({ value }) => toList(value))
    @IsArray()
    @ArrayMaxSize(ListingStatusSchema.options.length)
    @IsIn(ListingStatusSchema.options, { each: true })
    status?: ListingStatus[];

    @IsOptional()
    @IsIn(AdStatusSchema.options)
    adStatus?: AdStatus;

    /** `me`, `unassigned` or a user id. */
    @IsOptional()
    @IsString()
    @Matches(UUID_OR_KEYWORD, {
      message: 'assignedTo must be me, unassigned or a user id',
    })
    assignedTo?: string;

    @IsOptional()
    @Transform(({ value }: { value: unknown }) => toBoolean(value))
    @IsBoolean()
    checkInDue?: boolean;

    /** Area, compound, address, description, owner name; phone digits on visible phones. */
    @IsOptional()
    @IsString()
    @MaxLength(SEARCH_MAX_LENGTH)
    q?: string;

    @IsOptional()
    @IsIn(ListingSortSchema.options)
    sort?: ListingSort;
  }
  return ListingFilters;
}

/** `GET /listings`. */
export class ListingListQueryDto extends withListingFilters(
  PaginationQueryDto,
) {}
