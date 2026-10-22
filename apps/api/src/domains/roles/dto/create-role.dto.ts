import {
  PERMISSION_KEYS,
  ROLE_NAME_MAX_LENGTH,
  type Permission,
} from '@prime-crm/shared';
import { Transform } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsIn,
  IsNotEmpty,
  IsString,
  MaxLength,
} from 'class-validator';

export const trimRoleName = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim() : value;

/** `POST /roles` (mirrors CreateRoleRequestSchema). Unknown permission keys → 400. */
export class CreateRoleDto {
  @Transform(trimRoleName)
  @IsString()
  @IsNotEmpty()
  @MaxLength(ROLE_NAME_MAX_LENGTH)
  name!: string;

  @IsArray()
  @ArrayMaxSize(PERMISSION_KEYS.length)
  @IsIn(PERMISSION_KEYS, { each: true })
  permissions!: Permission[];
}
