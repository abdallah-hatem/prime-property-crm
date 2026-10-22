import {
  AREA_MAX_LENGTH,
  NOTE_BODY_MAX_LENGTH,
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
  IsNotEmpty,
  IsString,
  IsUUID,
  MaxLength,
} from 'class-validator';
import { trimString } from '../../../common/utils/query-list.util';
import {
  DistinctPhones,
  IsPhone,
} from '../../../common/validators/is-phone.validator';
import { IsOptionalNotNull } from '../../../common/validators/optional-not-null.validator';

const trim = ({ value }: { value: unknown }) => trimString(value);

/** `POST /owners` (mirrors CreateOwnerRequestSchema). Phones arrive as typed. */
export class CreateOwnerDto {
  @Transform(trim)
  @IsString()
  @IsNotEmpty()
  @MaxLength(OWNER_NAME_MAX_LENGTH)
  name!: string;

  @IsArray()
  @ArrayMinSize(OWNER_PHONES_MIN)
  @ArrayMaxSize(OWNER_PHONES_MAX)
  @IsString({ each: true })
  @MaxLength(PHONE_INPUT_MAX_LENGTH, { each: true })
  @IsPhone({ each: true })
  @DistinctPhones()
  phones!: string[];

  @IsOptionalNotNull()
  @Transform(trim)
  @IsString()
  @IsNotEmpty()
  @MaxLength(AREA_MAX_LENGTH)
  area?: string;

  @IsOptionalNotNull()
  @Transform(trim)
  @IsString()
  @IsNotEmpty()
  @MaxLength(NOTE_BODY_MAX_LENGTH)
  note?: string;

  /** Needs owners.assign (checked by the service: 403 otherwise). */
  @IsOptionalNotNull()
  @IsUUID()
  assignedTo?: string;
}
