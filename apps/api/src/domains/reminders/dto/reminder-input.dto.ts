import { NOTE_BODY_MAX_LENGTH } from '@prime-crm/shared';
import { Transform } from 'class-transformer';
import { IsNotEmpty, IsString, MaxLength } from 'class-validator';
import { trimString } from '../../../common/utils/query-list.util';
import { IsInstant } from '../../../common/validators/is-instant.validator';
import { IsOptionalNotNull } from '../../../common/validators/optional-not-null.validator';

/** A due time and an optional note: a call outcome's `reminder` (mirrors ReminderInputSchema). */
export class ReminderInputDto {
  @IsInstant()
  dueAt!: string;

  @IsOptionalNotNull()
  @Transform(({ value }: { value: unknown }) => trimString(value))
  @IsString()
  @IsNotEmpty()
  @MaxLength(NOTE_BODY_MAX_LENGTH)
  note?: string;
}
