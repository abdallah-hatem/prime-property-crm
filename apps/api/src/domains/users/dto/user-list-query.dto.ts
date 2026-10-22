import { USER_SEARCH_MAX_LENGTH } from '@prime-crm/shared';
import {
  IsBoolean,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
} from 'class-validator';
import { PaginationQueryDto } from '../../../common/dto/pagination-query.dto';
import { ActiveQuery } from './active-query.transform';

/** `GET /users` (mirrors UserListQuerySchema). */
export class UserListQueryDto extends PaginationQueryDto {
  /** Matches name, email or phone (a phone typed any way also matches its E.164 form). */
  @IsOptional()
  @IsString()
  @MaxLength(USER_SEARCH_MAX_LENGTH)
  q?: string;

  @IsOptional()
  @IsUUID()
  roleId?: string;

  @IsOptional()
  @ActiveQuery()
  @IsBoolean()
  active?: boolean;
}
