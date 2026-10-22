import { PICKER_LIMIT_MAX } from '@prime-crm/shared';
import { Type } from 'class-transformer';
import { IsInt, IsOptional, Max, Min } from 'class-validator';

/** `?page&limit` for endpoints the contract marks *picker*: limit up to 100, default 100. */
export class PickerQueryDto {
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
