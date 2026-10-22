import { Transform } from 'class-transformer';
import { IsBoolean, IsOptional } from 'class-validator';
import { toBoolean } from '../../../common/utils/query-list.util';
import { PickerQueryDto } from '../../users/dto/picker-query.dto';

/**
 * `GET /call-outcomes`: a picker (limit up to 100, default 100) so the outcome sheet gets the
 * whole list in one page. `includeHidden` needs settings.manage.
 */
export class CallOutcomeQueryDto extends PickerQueryDto {
  @IsOptional()
  @Transform(({ value }: { value: unknown }) => toBoolean(value))
  @IsBoolean()
  includeHidden?: boolean;
}
