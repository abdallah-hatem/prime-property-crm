import { IsBoolean, IsOptional } from 'class-validator';
import { ActiveQuery } from './active-query.transform';
import { PickerQueryDto } from './picker-query.dto';

/** `GET /users/options` (mirrors UserOptionsQuerySchema). Active users unless `active=false`. */
export class UserOptionsQueryDto extends PickerQueryDto {
  @IsOptional()
  @ActiveQuery()
  @IsBoolean()
  active?: boolean;
}
