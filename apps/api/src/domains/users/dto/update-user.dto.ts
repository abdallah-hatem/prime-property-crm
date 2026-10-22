import {
  EMAIL_MAX_LENGTH,
  LanguageSchema,
  NAME_MAX_LENGTH,
  normalizeEmail,
  type Language,
} from '@prime-crm/shared';
import { Transform } from 'class-transformer';
import {
  IsEmail,
  IsIn,
  IsNotEmpty,
  IsString,
  IsUUID,
  MaxLength,
  ValidateIf,
} from 'class-validator';
import { IsOptionalNotNull } from './optional.decorator';
import { IsPhone } from '../../../common/validators/is-phone.validator';

/**
 * `PATCH /users/:id` (mirrors UpdateUserRequestSchema): the create fields minus the password,
 * all optional. `phone: null` clears it; `active` and the password have their own endpoints.
 * Written out rather than `PartialType(CreateUserDto)`: @nestjs/mapped-types isn't a dependency,
 * and users-contract.spec.ts checks both DTOs against the shared schemas.
 */
export class UpdateUserDto {
  @IsOptionalNotNull()
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  @IsString()
  @IsNotEmpty()
  @MaxLength(NAME_MAX_LENGTH)
  name?: string;

  @IsOptionalNotNull()
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? normalizeEmail(value) : value,
  )
  @IsString()
  @IsEmail()
  @MaxLength(EMAIL_MAX_LENGTH)
  email?: string;

  @ValidateIf((_, value) => value !== null && value !== undefined)
  @IsString()
  @MaxLength(40)
  @IsPhone()
  phone?: string | null;

  @IsOptionalNotNull()
  @IsUUID()
  roleId?: string;

  @IsOptionalNotNull()
  @IsIn(LanguageSchema.options)
  language?: Language;
}
