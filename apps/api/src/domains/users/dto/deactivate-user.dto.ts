import { IsDefined, IsUUID, ValidateIf } from 'class-validator';

/**
 * `POST /users/:id/deactivate` (mirrors DeactivateUserRequestSchema). `handOverTo` must be sent:
 * a user id, or `null` for "leave their work unassigned".
 */
export class DeactivateUserDto {
  @IsDefined()
  @ValidateIf((_, value) => value !== null)
  @IsUUID()
  handOverTo!: string | null;
}
