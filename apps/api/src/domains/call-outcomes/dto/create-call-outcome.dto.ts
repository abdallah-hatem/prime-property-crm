import {
  OUTCOME_LABEL_MAX_LENGTH,
  OutcomeStatusSchema,
  type OutcomeStatus,
} from '@prime-crm/shared';
import { Transform } from 'class-transformer';
import { IsIn, IsNotEmpty, IsString, MaxLength } from 'class-validator';
import { trimString } from '../../../common/utils/query-list.util';

const trim = ({ value }: { value: unknown }) => trimString(value);

/** `POST /call-outcomes` (mirrors CreateCallOutcomeRequestSchema). LISTED is refused. */
export class CreateCallOutcomeDto {
  @Transform(trim)
  @IsString()
  @IsNotEmpty()
  @MaxLength(OUTCOME_LABEL_MAX_LENGTH)
  labelEn!: string;

  @Transform(trim)
  @IsString()
  @IsNotEmpty()
  @MaxLength(OUTCOME_LABEL_MAX_LENGTH)
  labelAr!: string;

  @IsIn(OutcomeStatusSchema.options, {
    message: `setsStatus must be one of ${OutcomeStatusSchema.options.join(', ')} (only a listing sets LISTED)`,
  })
  setsStatus!: OutcomeStatus;
}
