import { ActivityTypeSchema, type ActivityType } from '@prime-crm/shared';
import { Transform } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsIn,
  IsISO8601,
  IsOptional,
  IsUUID,
  Matches,
} from 'class-validator';
import { PaginationQueryDto } from '../../../common/dto/pagination-query.dto';

/** A Cairo date (YYYY-MM-DD) or a full ISO instant; week and ordinal ISO forms are refused. */
const DATE_OR_INSTANT = /^\d{4}-\d{2}-\d{2}(T.+)?$/;
const DATE_MESSAGE = '$property must be a date (YYYY-MM-DD) or an ISO instant';

/** `?type=IMPORT&type=ASSIGN` and `?type=IMPORT,ASSIGN` both become ['IMPORT', 'ASSIGN']. */
function toList(value: unknown): unknown {
  if (value === undefined || value === '') return undefined;
  const items = Array.isArray(value) ? value : [value];
  return items.flatMap((item) =>
    typeof item === 'string'
      ? item
          .split(',')
          .map((s) => s.trim())
          .filter(Boolean)
      : [item],
  );
}

/** `GET /activity` filters (spec: type[], actorId, from, to, page, limit). */
export class ActivityQueryDto extends PaginationQueryDto {
  @IsOptional()
  @Transform(({ value }) => toList(value))
  @IsArray()
  @ArrayMaxSize(ActivityTypeSchema.options.length)
  @IsIn(ActivityTypeSchema.options, { each: true })
  type?: ActivityType[];

  @IsOptional()
  @IsUUID()
  actorId?: string;

  /** A date means the start of that Cairo day. */
  @IsOptional()
  @Matches(DATE_OR_INSTANT, { message: DATE_MESSAGE })
  @IsISO8601({ strict: true }, { message: DATE_MESSAGE })
  from?: string;

  /** A date means through the end of that Cairo day. */
  @IsOptional()
  @Matches(DATE_OR_INSTANT, { message: DATE_MESSAGE })
  @IsISO8601({ strict: true }, { message: DATE_MESSAGE })
  to?: string;
}
