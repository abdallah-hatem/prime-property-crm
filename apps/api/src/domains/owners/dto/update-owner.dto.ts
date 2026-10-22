import {
  AREA_MAX_LENGTH,
  OWNER_NAME_MAX_LENGTH,
  OWNER_PHONES_MAX,
  OWNER_PHONES_MIN,
  PHONE_INPUT_MAX_LENGTH,
} from '@prime-crm/shared';
import { Transform } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsNotEmpty,
  IsString,
  MaxLength,
  ValidateIf,
} from 'class-validator';
import { trimString } from '../../../common/utils/query-list.util';
import {
  DistinctPhones,
  IsPhone,
} from '../../../common/validators/is-phone.validator';
import { IsOptionalNotNull } from '../../../common/validators/optional-not-null.validator';

const trim = ({ value }: { value: unknown }) => trimString(value);

/**
 * `PATCH /owners/:id` (mirrors UpdateOwnerRequestSchema). Not a PartialType of create: it has
 * no note or assignee, `area: null` clears the area, and `doNotCall` exists only here.
 */
export class UpdateOwnerDto {
  @IsOptionalNotNull()
  @Transform(trim)
  @IsString()
  @IsNotEmpty()
  @MaxLength(OWNER_NAME_MAX_LENGTH)
  name?: string;

  /** Replaces the whole list. */
  @IsOptionalNotNull()
  @IsArray()
  @ArrayMinSize(OWNER_PHONES_MIN)
  @ArrayMaxSize(OWNER_PHONES_MAX)
  @IsString({ each: true })
  @MaxLength(PHONE_INPUT_MAX_LENGTH, { each: true })
  @IsPhone({ each: true })
  @DistinctPhones()
  phones?: string[];

  /** `null` clears it. */
  @ValidateIf((_, value) => value !== null && value !== undefined)
  @Transform(trim)
  @IsString()
  @IsNotEmpty()
  @MaxLength(AREA_MAX_LENGTH)
  area?: string | null;

  /** `true` sets Do not call; `false` (owners.viewAll only) clears it to Contacted. */
  @IsOptionalNotNull()
  @IsBoolean()
  doNotCall?: boolean;
}
