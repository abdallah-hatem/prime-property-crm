import {
  ReminderKindSchema,
  ReminderStateSchema,
  ReminderWhenSchema,
  type ReminderKind,
  type ReminderState,
  type ReminderWhen,
} from '@prime-crm/shared';
import { Transform } from 'class-transformer';
import { IsBoolean, IsIn, IsOptional, IsUUID } from 'class-validator';
import { PaginationQueryDto } from '../../../common/dto/pagination-query.dto';
import { toBoolean } from '../../../common/utils/query-list.util';

/**
 * `GET /reminders`: `state`, `when`, `kind`, `memberId` (another member's needs
 * analytics.view), `unassigned` (needs owners.assign).
 */
export class ReminderQueryDto extends PaginationQueryDto {
  @IsOptional()
  @IsIn(ReminderStateSchema.options)
  state?: ReminderState;

  @IsOptional()
  @IsIn(ReminderWhenSchema.options)
  when?: ReminderWhen;

  @IsOptional()
  @IsIn(ReminderKindSchema.options)
  kind?: ReminderKind;

  @IsOptional()
  @IsUUID()
  memberId?: string;

  @IsOptional()
  @Transform(({ value }: { value: unknown }) => toBoolean(value))
  @IsBoolean()
  unassigned?: boolean;
}
