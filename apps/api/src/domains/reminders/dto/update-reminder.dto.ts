import { NOTE_BODY_MAX_LENGTH } from '@prime-crm/shared';
import { Transform } from 'class-transformer';
import { IsNotEmpty, IsString, MaxLength, ValidateIf } from 'class-validator';
import { trimString } from '../../../common/utils/query-list.util';
import { IsInstant } from '../../../common/validators/is-instant.validator';
import { IsOptionalNotNull } from '../../../common/validators/optional-not-null.validator';

/** `PATCH /reminders/:id` (mirrors UpdateReminderRequestSchema). `note: null` clears it. */
export class UpdateReminderDto {
  @IsOptionalNotNull()
  @IsInstant()
  dueAt?: string;

  @ValidateIf((_, value) => value !== null && value !== undefined)
  @Transform(({ value }: { value: unknown }) => trimString(value))
  @IsString()
  @IsNotEmpty()
  @MaxLength(NOTE_BODY_MAX_LENGTH)
  note?: string | null;
}
