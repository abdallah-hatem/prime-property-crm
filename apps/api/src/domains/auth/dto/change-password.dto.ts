import { PASSWORD_MAX_LENGTH, PASSWORD_MIN_LENGTH } from '@prime-crm/shared';
import { IsNotEmpty, IsString, MaxLength, MinLength } from 'class-validator';

/** `POST /auth/me/password` (mirrors ChangePasswordRequestSchema). */
export class ChangePasswordDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(PASSWORD_MAX_LENGTH)
  currentPassword!: string;

  @IsString()
  @MinLength(PASSWORD_MIN_LENGTH)
  @MaxLength(PASSWORD_MAX_LENGTH)
  newPassword!: string;
}
