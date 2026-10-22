import { ActivityTypeSchema, type ActivityType } from '@prime-crm/shared';
import { Transform } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsIn,
  IsOptional,
  IsUUID,
} from 'class-validator';
import { PaginationQueryDto } from '../../../common/dto/pagination-query.dto';
import { toList } from '../../../common/utils/query-list.util';
import { IsDateOrInstant } from '../../../common/validators/date-or-instant.validator';

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
  @IsDateOrInstant()
  from?: string;

  /** A date means through the end of that Cairo day. */
  @IsOptional()
  @IsDateOrInstant()
  to?: string;
}
