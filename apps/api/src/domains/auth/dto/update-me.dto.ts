import {
  LanguageSchema,
  NAME_MAX_LENGTH,
  type Language,
} from '@prime-crm/shared';
import { Transform } from 'class-transformer';
import {
  IsIn,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
  ValidateIf,
} from 'class-validator';
import { IsPhone } from '../../../common/validators/is-phone.validator';

/**
 * `PATCH /auth/me` (mirrors UpdateMeRequestSchema): name, phone, language only. Role, email and
 * active are not fields here, so the strict pipe answers 400 for them.
 */
export class UpdateMeDto {
  @IsOptional()
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  @IsString()
  @IsNotEmpty()
  @MaxLength(NAME_MAX_LENGTH)
  name?: string;

  /** `null` clears it. */
  @ValidateIf((_, value) => value !== null && value !== undefined)
  @IsString()
  @MaxLength(40)
  @IsPhone()
  phone?: string | null;

  @IsOptional()
  @IsIn(LanguageSchema.options)
  language?: Language;
}
