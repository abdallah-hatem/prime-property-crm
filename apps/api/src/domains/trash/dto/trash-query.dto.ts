import { TrashKindSchema, type TrashKind } from '@prime-crm/shared';
import { Transform } from 'class-transformer';
import { IsIn, IsOptional, IsUUID } from 'class-validator';
import { PaginationQueryDto } from '../../../common/dto/pagination-query.dto';

const upper = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.toUpperCase() : value;

/** `GET /trash?kind=OWNER&page=1&limit=20`; no kind lists every kind together. */
export class TrashQueryDto extends PaginationQueryDto {
  @IsOptional()
  @Transform(upper)
  @IsIn(TrashKindSchema.options)
  kind?: TrashKind;
}

/** `POST /trash/:kind/:id/restore` (kind case-insensitive: OWNER or owner). */
export class TrashItemParamsDto {
  @Transform(upper)
  @IsIn(TrashKindSchema.options)
  kind: TrashKind;

  @IsUUID()
  id: string;
}
