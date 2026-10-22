import { OWNER_BULK_MAX } from '@prime-crm/shared';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsDefined,
  IsUUID,
  ValidateIf,
} from 'class-validator';

/** `POST /owners/assign` (mirrors AssignOwnersRequestSchema). `assigneeId: null` = unassigned. */
export class AssignOwnersDto {
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(OWNER_BULK_MAX)
  @IsUUID('all', { each: true })
  ownerIds!: string[];

  @IsDefined()
  @ValidateIf((_, value) => value !== null)
  @IsUUID()
  assigneeId!: string | null;
}
