import {
  OUTCOME_LABEL_MAX_LENGTH,
  OUTCOME_ORDER_MAX,
  OutcomeStatusSchema,
  type OutcomeStatus,
} from '@prime-crm/shared';
import { Transform } from 'class-transformer';
import {
  IsBoolean,
  IsIn,
  IsInt,
  IsNotEmpty,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import { trimString } from '../../../common/utils/query-list.util';
import { IsOptionalNotNull } from '../../../common/validators/optional-not-null.validator';

const trim = ({ value }: { value: unknown }) => trimString(value);

/**
 * `PATCH /call-outcomes/:id` (mirrors UpdateCallOutcomeRequestSchema): rename, remap, hide,
 * reorder. Every field optional but never null (no PartialType: it would let null through).
 */
export class UpdateCallOutcomeDto {
  @IsOptionalNotNull()
  @Transform(trim)
  @IsString()
  @IsNotEmpty()
  @MaxLength(OUTCOME_LABEL_MAX_LENGTH)
  labelEn?: string;

  @IsOptionalNotNull()
  @Transform(trim)
  @IsString()
  @IsNotEmpty()
  @MaxLength(OUTCOME_LABEL_MAX_LENGTH)
  labelAr?: string;

  @IsOptionalNotNull()
  @IsIn(OutcomeStatusSchema.options, {
    message: `setsStatus must be one of ${OutcomeStatusSchema.options.join(', ')} (only a listing sets LISTED)`,
  })
  setsStatus?: OutcomeStatus;

  @IsOptionalNotNull()
  @IsBoolean()
  hidden?: boolean;

  @IsOptionalNotNull()
  @IsInt()
  @Min(0)
  @Max(OUTCOME_ORDER_MAX)
  order?: number;
}
