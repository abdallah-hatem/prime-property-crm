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
import { IsOptionalNotNull } from '../../../common/validators/optional-not-null.validator';
import { trimRoleName } from './create-role.dto';

/**
 * `PATCH /roles/:id` (mirrors UpdateRoleRequestSchema). Written out rather than
 * `PartialType(CreateRoleDto)`: @nestjs/mapped-types isn't a dependency; the contract spec
 * checks it.
 */
export class UpdateRoleDto {
  @IsOptionalNotNull()
  @Transform(trimRoleName)
  @IsString()
  @IsNotEmpty()
  @MaxLength(ROLE_NAME_MAX_LENGTH)
  name?: string;

  @IsOptionalNotNull()
  @IsArray()
  @ArrayMaxSize(PERMISSION_KEYS.length)
  @IsIn(PERMISSION_KEYS, { each: true })
  permissions?: Permission[];
}
