import { z } from 'zod';
import { PAGE_LIMIT_MAX } from './envelope';
import {
  ImportIssueReasonSchema,
  ImportKindSchema,
  ImportStatusSchema,
  type ImportKind,
} from './enums';
import { UserSummarySchema } from './summary';

/**
 * Imports contract (spec, "Imports — /imports"). Owners and listings share one flow: upload
 * (parsed at once, rows kept in the database) → preview with a mapping → confirm (one
 * transaction). The API's DTOs mirror these schemas; `imports-contract.spec.ts` checks it.
 */

/** Upload limits: 4 MB, 20 000 data rows, first sheet only. */
export const IMPORT_MAX_BYTES = 4 * 1024 * 1024;
export const IMPORT_MAX_ROWS = 20_000;
export const IMPORT_FILE_EXTENSIONS = ['.xlsx', '.xls', '.csv'] as const;
/** `POST /imports/:id/preview` returns this many mapped rows and at most this many issues. */
export const IMPORT_SAMPLE_SIZE = 20;
export const IMPORT_PREVIEW_ISSUES = 100;

/** Domain error codes of the import endpoints. */
export const ImportErrorCode = {
  /** Not an .xlsx, .xls or .csv file, or one that can't be read as one. */
  FILE_TYPE: 'FILE_TYPE',
  FILE_TOO_LARGE: 'FILE_TOO_LARGE',
  TOO_MANY_ROWS: 'TOO_MANY_ROWS',
  /** No header row, or no data row under it. */
  EMPTY_FILE: 'EMPTY_FILE',
  /** A required field of the kind isn't mapped. */
  MAPPING_INCOMPLETE: 'MAPPING_INCOMPLETE',
  /** A mapping key that isn't a field of the kind, or a header the file doesn't have. */
  MAPPING_INVALID: 'MAPPING_INVALID',
  /** Preview of a finished import. */
  IMPORT_NOT_EDITABLE: 'IMPORT_NOT_EDITABLE',
  /** Confirm before a (successful) preview. */
  IMPORT_NOT_PREVIEWED: 'IMPORT_NOT_PREVIEWED',
  IMPORT_ALREADY_DONE: 'IMPORT_ALREADY_DONE',
  /** 500: confirm failed partway; nothing was saved and the job is FAILED (preview again). */
  IMPORT_FAILED: 'IMPORT_FAILED',
} as const;
export type ImportErrorCode =
  (typeof ImportErrorCode)[keyof typeof ImportErrorCode];

/**
 * Fields a column can be mapped to. Owners: up to three phones. Listings: `name` and `phone`
 * are the owner's contact, the rest are the `POST /listings` fields.
 */
export const OWNER_IMPORT_FIELDS = [
  'name',
  'phone',
  'phone2',
  'phone3',
  'area',
  'note',
] as const;
export const LISTING_IMPORT_FIELDS = [
  'name',
  'phone',
  'purpose',
  'type',
  'area',
  'compound',
  'address',
  'sizeSqm',
  'floor',
  'bedrooms',
  'bathrooms',
  'price',
  'furnishing',
  'description',
] as const;
export type OwnerImportField = (typeof OWNER_IMPORT_FIELDS)[number];
export type ListingImportField = (typeof LISTING_IMPORT_FIELDS)[number];
export type ImportField = OwnerImportField | ListingImportField;

/**
 * Fields that must be mapped. Listings need `sizeSqm` too: `POST /listings` requires it and
 * the column is NOT NULL (the spec's list omitted it).
 */
export const IMPORT_REQUIRED_FIELDS: Record<
  ImportKind,
  readonly ImportField[]
> = {
  OWNERS: ['name', 'phone'],
  LISTINGS: ['name', 'phone', 'purpose', 'type', 'area', 'sizeSqm', 'price'],
};

export function importFieldsOf(kind: ImportKind): readonly ImportField[] {
  return kind === 'OWNERS' ? OWNER_IMPORT_FIELDS : LISTING_IMPORT_FIELDS;
}

/** `{ field: header }`: which file column fills each field. */
export const ImportMappingSchema = z.record(z.string(), z.string().min(1));
export type ImportMapping = z.infer<typeof ImportMappingSchema>;

// ------------------------------------------------------------------ requests

/** `POST /imports` (multipart): the text part next to `file`. */
export const UploadImportRequestSchema = z.strictObject({
  kind: ImportKindSchema,
});
export type UploadImportRequest = z.infer<typeof UploadImportRequestSchema>;

/** `POST /imports/:id/preview`. `assignTo` needs owners.assign and an active member. */
export const PreviewImportRequestSchema = z.strictObject({
  mapping: ImportMappingSchema,
  assignTo: z.uuid().optional(),
});
export type PreviewImportRequest = z.infer<typeof PreviewImportRequestSchema>;

export const ImportListQuerySchema = z.strictObject({
  kind: ImportKindSchema.optional(),
  page: z.coerce.number().int().min(1).optional(),
  limit: z.coerce.number().int().min(1).max(PAGE_LIMIT_MAX).optional(),
});
export type ImportListQuery = z.input<typeof ImportListQuerySchema>;

export const ImportIssuesQuerySchema = z.strictObject({
  reason: ImportIssueReasonSchema.optional(),
  page: z.coerce.number().int().min(1).optional(),
  limit: z.coerce.number().int().min(1).max(PAGE_LIMIT_MAX).optional(),
});
export type ImportIssuesQuery = z.input<typeof ImportIssuesQuerySchema>;

// ------------------------------------------------------------------ responses

export const ImportCountsSchema = z.object({
  total: z.number().int(),
  added: z.number().int(),
  duplicates: z.number().int(),
  rejected: z.number().int(),
});
export type ImportCounts = z.infer<typeof ImportCountsSchema>;

/**
 * `mapping` is the suggested one after upload (from the header names, English or Arabic) and
 * the chosen one after preview. `counts` is null until a preview; after a preview it is what
 * confirm would do, after confirm what it did (`added + duplicates + rejected = total`).
 */
export const ImportJobSchema = z.object({
  id: z.uuid(),
  kind: ImportKindSchema,
  fileName: z.string(),
  status: ImportStatusSchema,
  headers: z.array(z.string()),
  mapping: ImportMappingSchema.nullable(),
  counts: ImportCountsSchema.nullable(),
  /** Additive: the member every imported row goes to (chosen at preview). */
  assignTo: UserSummarySchema.nullable(),
  /** Additive: data rows in the file. */
  totalRows: z.number().int(),
  createdBy: UserSummarySchema,
  createdAt: z.string(),
});
export type ImportJob = z.infer<typeof ImportJobSchema>;

/**
 * One row the import won't add. `row` counts data rows from 1 (the header is not a row).
 * DUPLICATE: `matches` names the owner or listing that holds the phone (ids only for callers
 * who may see them; null for an earlier row of the same file). `inTrash` (additive): the
 * owner holding the phone is in the trash.
 */
export const ImportIssueSchema = z.object({
  row: z.number().int(),
  reason: ImportIssueReasonSchema,
  field: z.string().nullable(),
  value: z.string().nullable(),
  matches: z
    .object({ ownerId: z.uuid().nullable(), listingId: z.uuid().nullable() })
    .nullable(),
  inTrash: z.boolean(),
});
export type ImportIssue = z.infer<typeof ImportIssueSchema>;

export const ImportPreviewSchema = z.object({
  job: ImportJobSchema,
  sample: z.array(z.record(z.string(), z.unknown())),
  issues: z.array(ImportIssueSchema),
});
export type ImportPreview = z.infer<typeof ImportPreviewSchema>;
