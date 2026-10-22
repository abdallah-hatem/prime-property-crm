import { NOTE_BODY_MAX_LENGTH } from '@prime-crm/shared';
import { Transform } from 'class-transformer';
import { IsNotEmpty, IsString, MaxLength } from 'class-validator';
import { trimString } from '../../../common/utils/query-list.util';

/** `POST /owners/:id/notes` and `POST /listings/:id/notes` (mirrors CreateNoteRequestSchema). */
export class CreateNoteDto {
  @Transform(({ value }: { value: unknown }) => trimString(value))
  @IsString()
  @IsNotEmpty()
  @MaxLength(NOTE_BODY_MAX_LENGTH)
  body!: string;
}
