import { Transform } from 'class-transformer';
import { IsBoolean, IsOptional, IsUUID } from 'class-validator';
import { PaginationQueryDto } from '../../../common/dto/pagination-query.dto';
import { toBoolean } from '../../../common/utils/query-list.util';
import { IsDateOrInstant } from '../../../common/validators/date-or-instant.validator';

/**
 * `GET /calls`. Without analytics.view the list is the caller's own calls whatever `memberId`
 * says. `from`/`to`: a Cairo date (whole day) or an ISO instant, on the call's start.
 */
export class CallQueryDto extends PaginationQueryDto {
  @IsOptional()
  @IsUUID()
  memberId?: string;

  @IsOptional()
  @IsUUID()
  ownerId?: string;

  @IsOptional()
  @IsUUID()
  outcomeId?: string;

  @IsOptional()
  @IsDateOrInstant()
  from?: string;

  @IsOptional()
  @IsDateOrInstant()
  to?: string;

  /** true: only calls still waiting for their outcome; false: only calls that have one. */
  @IsOptional()
  @Transform(({ value }: { value: unknown }) => toBoolean(value))
  @IsBoolean()
  missingOutcome?: boolean;
}
