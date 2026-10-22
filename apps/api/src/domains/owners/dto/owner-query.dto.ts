import {
  AREA_MAX_LENGTH,
  LeadStatusSchema,
  OWNER_BULK_MAX,
  OwnerSortSchema,
  SEARCH_MAX_LENGTH,
  type LeadStatus,
  type OwnerSort,
} from '@prime-crm/shared';
import { Transform, Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import { PaginationQueryDto } from '../../../common/dto/pagination-query.dto';
import { toBoolean, toList } from '../../../common/utils/query-list.util';

const UUID_OR_KEYWORD =
  /^(me|unassigned|[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})$/i;

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- TS requires any[] for a mixin base constructor
type Constructor = new (...args: any[]) => object;

/**
 * Adds the `GET /owners` filters to a base DTO, so the list (with paging), `/owners/ids` (with
 * `take`) and the owners export share one definition.
 */
export function withOwnerFilters<TBase extends Constructor>(Base: TBase) {
  class OwnerFilters extends Base {
    /** Name or phone. */
    @IsOptional()
    @IsString()
    @MaxLength(SEARCH_MAX_LENGTH)
    q?: string;

    /** `?status=NEW&status=CALL_BACK` or `?status=NEW,CALL_BACK`. */
    @IsOptional()
    @Transform(({ value }) => toList(value))
    @IsArray()
    @ArrayMaxSize(LeadStatusSchema.options.length)
    @IsIn(LeadStatusSchema.options, { each: true })
    status?: LeadStatus[];

    /** `me`, `unassigned` or a user id. Ignored without owners.viewAll (own only). */
    @IsOptional()
    @IsString()
    @Matches(UUID_OR_KEYWORD, {
      message: 'assignedTo must be me, unassigned or a user id',
    })
    assignedTo?: string;

    @IsOptional()
    @IsString()
    @MaxLength(AREA_MAX_LENGTH)
    area?: string;

    @IsOptional()
    @IsUUID()
    importId?: string;

    /** Has an open reminder (true) or none (false). */
    @IsOptional()
    @Transform(({ value }: { value: unknown }) => toBoolean(value))
    @IsBoolean()
    hasReminder?: boolean;

    @IsOptional()
    @IsIn(OwnerSortSchema.options)
    sort?: OwnerSort;
  }
  return OwnerFilters;
}

/** `GET /owners`. */
export class OwnerListQueryDto extends withOwnerFilters(PaginationQueryDto) {}

/** `GET /owners/ids`: the list filters plus `take` (≤ 5000, default 5000). */
export class OwnerIdsQueryDto extends withOwnerFilters(class {}) {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(OWNER_BULK_MAX)
  take: number = OWNER_BULK_MAX;
}
