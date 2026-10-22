import { Transform } from 'class-transformer';
import { IsBoolean, IsOptional } from 'class-validator';
import { PaginationQueryDto } from '../../../common/dto/pagination-query.dto';
import { toBoolean } from '../../../common/utils/query-list.util';

/**
 * `GET /reminders`. T6 ships `unassigned` (needs owners.assign); the calls/reminders task adds
 * `state`, `when`, `kind` and `memberId`.
 */
export class ReminderQueryDto extends PaginationQueryDto {
  @IsOptional()
  @Transform(({ value }: { value: unknown }) => toBoolean(value))
  @IsBoolean()
  unassigned?: boolean;
}
