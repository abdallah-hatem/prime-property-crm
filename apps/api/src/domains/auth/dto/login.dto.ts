import {
  EMAIL_MAX_LENGTH,
  normalizeEmail,
  PASSWORD_MAX_LENGTH,
} from '@prime-crm/shared';
import { Transform } from 'class-transformer';
import { IsEmail, IsNotEmpty, IsString, MaxLength } from 'class-validator';

/** `POST /auth/login` (mirrors LoginRequestSchema). The email arrives trimmed and lower-cased. */
export class LoginDto {
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? normalizeEmail(value) : value,
  )
  @IsString()
  @IsEmail()
  @MaxLength(EMAIL_MAX_LENGTH)
  email!: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(PASSWORD_MAX_LENGTH)
  password!: string;
}
