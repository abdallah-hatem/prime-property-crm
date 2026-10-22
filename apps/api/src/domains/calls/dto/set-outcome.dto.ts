import { NOTE_BODY_MAX_LENGTH } from '@prime-crm/shared';
import { Transform, Type } from 'class-transformer';
import {
  IsNotEmpty,
  IsObject,
  IsString,
  IsUUID,
  MaxLength,
  ValidateNested,
} from 'class-validator';
import { trimString } from '../../../common/utils/query-list.util';
import { IsOptionalNotNull } from '../../../common/validators/optional-not-null.validator';
import { ReminderInputDto } from '../../reminders/dto/reminder-input.dto';

/** `POST /calls/:id/outcome` (mirrors SetCallOutcomeRequestSchema). */
export class SetOutcomeDto {
  @IsUUID()
  outcomeId!: string;

  @IsOptionalNotNull()
  @Transform(({ value }: { value: unknown }) => trimString(value))
  @IsString()
  @IsNotEmpty()
  @MaxLength(NOTE_BODY_MAX_LENGTH)
  note?: string;

  /** A reminder on the call's owner, saved in the same transaction. */
  @IsOptionalNotNull()
  @IsObject()
  @ValidateNested()
  @Type(() => ReminderInputDto)
  reminder?: ReminderInputDto;
}
