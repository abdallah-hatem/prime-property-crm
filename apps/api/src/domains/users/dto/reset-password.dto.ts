import { PASSWORD_MAX_LENGTH, PASSWORD_MIN_LENGTH } from '@prime-crm/shared';
import { IsString, MaxLength, MinLength } from 'class-validator';

/** `POST /users/:id/reset-password` (mirrors ResetPasswordRequestSchema). */
export class ResetPasswordDto {
  @IsString()
  @MinLength(PASSWORD_MIN_LENGTH)
  @MaxLength(PASSWORD_MAX_LENGTH)
  newPassword!: string;
}
