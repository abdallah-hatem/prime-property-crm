import { z } from 'zod';
import { toE164 } from '../logic/phone';
import { CallSchema } from './calls';
import { PAGE_LIMIT_MAX, PICKER_LIMIT_MAX } from './envelope';
import { LeadStatusSchema } from './enums';
import { NoteBodySchema, NoteSchema } from './notes';
import { ReminderSchema } from './reminders';
import { PhoneInputSchema } from './auth';
import { UserSummarySchema } from './summary';

/**
 * Owners contract (spec, "Owners — /owners"). The API's DTOs mirror these schemas with
 * class-validator; `apps/api/src/domains/owners/dto/owners-contract.spec.ts` checks they agree.
 */

export const OWNER_NAME_MAX_LENGTH = 200;
export const AREA_MAX_LENGTH = 100;
export const OWNER_PHONES_MIN = 1;
export const OWNER_PHONES_MAX = 3;
/** A phone as typed (before normalisation) is at most this long. */
export const PHONE_INPUT_MAX_LENGTH = 40;
/** `POST /owners/assign` and `GET /owners/ids?take=` accept at most this many ids. */
export const OWNER_BULK_MAX = 5000;
export const SEARCH_MAX_LENGTH = 100;

/** Domain error codes of the owner endpoints. */
export const OwnerErrorCode = {
  /** A phone already belongs to an owner or a live listing. */
  PHONE_EXISTS: 'PHONE_EXISTS',
  /** A phone belongs to a trashed owner (only told to callers with trash.restore). */
  PHONE_IN_TRASH: 'PHONE_IN_TRASH',
  /** The assignee is missing or deactivated. */
  INVALID_ASSIGNEE: 'INVALID_ASSIGNEE',
  /** The owner has a live listing: delete the listing first (or it can't be Do not call). */
  OWNER_LISTED: 'OWNER_LISTED',
} as const;
export type OwnerErrorCode =
  (typeof OwnerErrorCode)[keyof typeof OwnerErrorCode];

/** `data` of a `409 PHONE_EXISTS`: present only for callers with owners.viewAll. */
export const PhoneConflictSchema = z.object({
  phone: z.string(),
  ownerId: z.uuid().optional(),
  listingId: z.uuid().optional(),
});
export type PhoneConflict = z.infer<typeof PhoneConflictSchema>;

/** 1–3 phones, distinct once normalised (`01001234567` and `+20 100 123 4567` are one). */
export const OwnerPhonesSchema = z
  .array(PhoneInputSchema)
  .min(OWNER_PHONES_MIN)
  .max(OWNER_PHONES_MAX)
  .refine(
    (phones) => new Set(phones.map((p) => toE164(p))).size === phones.length,
    'phones must be distinct',
  );

const OwnerNameSchema = z.string().trim().min(1).max(OWNER_NAME_MAX_LENGTH);
const AreaSchema = z.string().trim().min(1).max(AREA_MAX_LENGTH);

export const CreateOwnerRequestSchema = z.strictObject({
  name: OwnerNameSchema,
  phones: OwnerPhonesSchema,
  area: AreaSchema.optional(),
  note: NoteBodySchema.optional(),
  /** Needs owners.assign. */
  assignedTo: z.uuid().optional(),
});
export type CreateOwnerRequest = z.input<typeof CreateOwnerRequestSchema>;

/**
 * `PATCH /owners/:id`. `phones` replaces the whole list. `area: null` clears it.
 * `doNotCall: true` sets DO_NOT_CALL; `false` needs owners.viewAll and sets CONTACTED.
 */
export const UpdateOwnerRequestSchema = z.strictObject({
  name: OwnerNameSchema.optional(),
  phones: OwnerPhonesSchema.optional(),
  area: AreaSchema.nullable().optional(),
  doNotCall: z.boolean().optional(),
});
export type UpdateOwnerRequest = z.input<typeof UpdateOwnerRequestSchema>;

export const AssignOwnersRequestSchema = z.strictObject({
  ownerIds: z.array(z.uuid()).min(1).max(OWNER_BULK_MAX),
  /** `null` = unassigned. */
  assigneeId: z.uuid().nullable(),
});
export type AssignOwnersRequest = z.infer<typeof AssignOwnersRequestSchema>;

export const AssignOwnersResponseSchema = z.object({ moved: z.number().int() });
export type AssignOwnersResponse = z.infer<typeof AssignOwnersResponseSchema>;

export const OwnerSortSchema = z.enum(['created', 'lastCall', 'name']);
export type OwnerSort = z.infer<typeof OwnerSortSchema>;

/** `?status=NEW&status=CALL_BACK` and `?status=NEW,CALL_BACK` are the same filter. */
const listParam = (value: unknown) => {
  if (value === undefined || value === '') return undefined;
  const items = Array.isArray(value) ? value : [value];
  return items.flatMap((item) =>
    typeof item === 'string'
      ? item
          .split(',')
          .map((s) => s.trim())
          .filter(Boolean)
      : [item],
  );
};

const booleanParam = z
  .enum(['true', 'false'])
  .transform((value) => value === 'true');

/**
 * `GET /owners` filters (also `GET /owners/ids`, `GET /exports/owners`). Without
 * owners.viewAll the caller sees only their own owners whatever `assignedTo` says.
 */
export const OwnerListQuerySchema = z.strictObject({
  q: z.string().max(SEARCH_MAX_LENGTH).optional(),
  status: z.preprocess(listParam, z.array(LeadStatusSchema).optional()),
  assignedTo: z
    .union([z.literal('me'), z.literal('unassigned'), z.uuid()])
    .optional(),
  area: z.string().max(AREA_MAX_LENGTH).optional(),
  importId: z.uuid().optional(),
  hasReminder: booleanParam.optional(),
  sort: OwnerSortSchema.optional(),
  page: z.coerce.number().int().min(1).optional(),
  limit: z.coerce.number().int().min(1).max(PAGE_LIMIT_MAX).optional(),
});
export type OwnerListQuery = z.input<typeof OwnerListQuerySchema>;

export const OwnerIdsQuerySchema = OwnerListQuerySchema.omit({
  page: true,
  limit: true,
}).extend({
  take: z.coerce.number().int().min(1).max(OWNER_BULK_MAX).optional(),
});
export type OwnerIdsQuery = z.input<typeof OwnerIdsQuerySchema>;

export const OwnerIdsResponseSchema = z.object({
  ids: z.array(z.uuid()),
  total: z.number().int(),
});
export type OwnerIdsResponse = z.infer<typeof OwnerIdsResponseSchema>;

export const OwnerRowSchema = z.object({
  id: z.uuid(),
  name: z.string(),
  phones: z.array(z.string()),
  area: z.string().nullable(),
  status: LeadStatusSchema,
  assignedTo: UserSummarySchema.nullable(),
  /** The latest call that has an outcome; the label is in the caller's language. */
  lastCall: z
    .object({
      at: z.string(),
      outcome: z.object({ id: z.uuid(), label: z.string() }),
    })
    .nullable(),
  /** Earliest open reminder on the owner. */
  nextReminderAt: z.string().nullable(),
  createdAt: z.string(),
});
export type OwnerRow = z.infer<typeof OwnerRowSchema>;

export const OwnerSchema = OwnerRowSchema.extend({
  /** The latest 3 notes, newest first. */
  notes: z.array(NoteSchema),
  listingId: z.uuid().nullable(),
  source: z.object({ importId: z.uuid(), fileName: z.string() }).nullable(),
});
export type Owner = z.infer<typeof OwnerSchema>;

export const OwnerTimelineItemSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('CALL'), at: z.string(), call: CallSchema }),
  z.object({ kind: z.literal('NOTE'), at: z.string(), note: NoteSchema }),
  z.object({
    kind: z.literal('REMINDER'),
    at: z.string(),
    reminder: ReminderSchema,
  }),
  z.object({
    kind: z.literal('ASSIGN'),
    at: z.string(),
    from: UserSummarySchema.nullable(),
    to: UserSummarySchema.nullable(),
    by: UserSummarySchema,
  }),
]);
export type OwnerTimelineItem = z.infer<typeof OwnerTimelineItemSchema>;

/** `GET /lookups/areas` (picker). */
export const AreaLookupQuerySchema = z.strictObject({
  q: z.string().max(SEARCH_MAX_LENGTH).optional(),
  page: z.coerce.number().int().min(1).optional(),
  limit: z.coerce.number().int().min(1).max(PICKER_LIMIT_MAX).optional(),
});
export type AreaLookupQuery = z.input<typeof AreaLookupQuerySchema>;

export const AreaOptionSchema = z.object({
  area: z.string(),
  compounds: z.array(z.string()),
});
export type AreaOption = z.infer<typeof AreaOptionSchema>;
