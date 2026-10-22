import { PICKER_LIMIT_MAX, SEARCH_MAX_LENGTH } from '@prime-crm/shared';
import { Type } from 'class-transformer';
import {
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

/** `GET /lookups/areas` (picker: limit up to 100). */
export class AreaLookupQueryDto {
  @IsOptional()
  @IsString()
  @MaxLength(SEARCH_MAX_LENGTH)
  q?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page: number = 1;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(PICKER_LIMIT_MAX)
  limit: number = PICKER_LIMIT_MAX;
}
