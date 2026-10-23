import { z } from 'zod';
import { InstantSchema } from './reminders';
import { UserSummarySchema } from './summary';

/** What can sit in the trash (spec, Shapes → TrashItem). */
export const TrashKindSchema = z.enum(['OWNER', 'LISTING', 'PHOTO']);
export type TrashKind = z.infer<typeof TrashKindSchema>;
export const TrashKind = TrashKindSchema.enum;

/**
 * A deleted record stays restorable for this many days (business doc, "Delete and restore"):
 * deleted exactly 30 days ago is still restorable, a minute later it is not.
 */
export const TRASH_RETENTION_DAYS = 30;

/** Domain error codes of `POST /trash/:kind/:id/restore`. */
export const TrashErrorCode = {
  PURGED: 'PURGED',
  OWNER_ALREADY_LISTED: 'OWNER_ALREADY_LISTED',
  PARENT_DELETED: 'PARENT_DELETED',
  TOO_MANY_PHOTOS: 'TOO_MANY_PHOTOS',
} as const;
export type TrashErrorCode =
  (typeof TrashErrorCode)[keyof typeof TrashErrorCode];

/** `TrashItem` (spec, Shapes): one restorable record in `GET /trash`. */
export const TrashItemSchema = z.object({
  kind: TrashKindSchema,
  id: z.uuid(),
  /** A readable label in the reader's language ("Hany Ragab", "Apartment · 3 BR · Madinaty"). */
  label: z.string(),
  deletedBy: UserSummarySchema.nullable(),
  deletedAt: InstantSchema,
  /** When it is removed for good: `deletedAt` + TRASH_RETENTION_DAYS. */
  purgeAt: InstantSchema,
});
export type TrashItem = z.infer<typeof TrashItemSchema>;
