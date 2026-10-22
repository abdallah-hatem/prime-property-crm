import {
  ImportIssueReasonSchema,
  ImportKindSchema,
  type ImportIssueReason,
  type ImportKind,
  type ImportMapping,
} from '@prime-crm/shared';
import {
  IsIn,
  IsObject,
  IsOptional,
  IsUUID,
  registerDecorator,
  type ValidationOptions,
} from 'class-validator';
import { PaginationQueryDto } from '../../../common/dto/pagination-query.dto';
import { IsOptionalNotNull } from '../../../common/validators/optional-not-null.validator';

/** `{ [field]: header }` with non-empty string headers (mirrors ImportMappingSchema). */
function IsMapping(options?: ValidationOptions) {
  return (target: object, propertyName: string) =>
    registerDecorator({
      name: 'isMapping',
      target: target.constructor,
      propertyName,
      options,
      validator: {
        validate: (value: unknown) =>
          typeof value === 'object' &&
          value !== null &&
          !Array.isArray(value) &&
          Object.values(value).every((v) => typeof v === 'string' && v !== ''),
        defaultMessage: () =>
          'mapping must map each field to a column name (a non-empty string)',
      },
    });
}

/** `POST /imports` (multipart): the `kind` text part next to `file`. */
export class UploadImportDto {
  @IsIn(ImportKindSchema.options)
  kind!: ImportKind;
}

/** `POST /imports/:id/preview` (mirrors PreviewImportRequestSchema). */
export class PreviewImportDto {
  @IsObject()
  @IsMapping()
  mapping!: ImportMapping;

  /** Needs owners.assign and an active member. */
  @IsOptionalNotNull()
  @IsUUID()
  assignTo?: string;
}

/** `GET /imports`. */
export class ImportListQueryDto extends PaginationQueryDto {
  @IsOptional()
  @IsIn(ImportKindSchema.options)
  kind?: ImportKind;
}

/** `GET /imports/:id/issues`. */
export class ImportIssuesQueryDto extends PaginationQueryDto {
  @IsOptional()
  @IsIn(ImportIssueReasonSchema.options)
  reason?: ImportIssueReason;
}
