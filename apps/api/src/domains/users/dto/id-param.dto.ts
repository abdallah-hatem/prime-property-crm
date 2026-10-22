import { IsUUID } from 'class-validator';

/** `/:id` route params: a UUID, or 400 before any lookup. */
export class IdParamDto {
  @IsUUID()
  id!: string;
}
