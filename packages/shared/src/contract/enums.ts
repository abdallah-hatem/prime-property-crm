import { z } from 'zod';

/**
 * Enums from the API contract (spec, "Enums"). The zod schema is the single source;
 * the TypeScript type and the value map are derived from it.
 */

export const LeadStatusSchema = z.enum([
  'NEW',
  'CONTACTED',
  'INTERESTED',
  'NOT_INTERESTED',
  'CALL_BACK',
  'LISTED',
  'DO_NOT_CALL',
]);
export type LeadStatus = z.infer<typeof LeadStatusSchema>;
export const LeadStatus = LeadStatusSchema.enum;

export const ListingPurposeSchema = z.enum(['SALE', 'RENT']);
export type ListingPurpose = z.infer<typeof ListingPurposeSchema>;
export const ListingPurpose = ListingPurposeSchema.enum;

export const ListingStatusSchema = z.enum([
  'AVAILABLE',
  'SOLD',
  'RENTED',
  'OFF_MARKET',
]);
export type ListingStatus = z.infer<typeof ListingStatusSchema>;
export const ListingStatus = ListingStatusSchema.enum;

export const PropertyTypeSchema = z.enum([
  'APARTMENT',
  'DUPLEX',
  'PENTHOUSE',
  'STUDIO',
  'VILLA',
  'TOWNHOUSE',
  'TWIN_HOUSE',
  'CHALET',
  'OFFICE',
  'SHOP',
  'LAND',
]);
export type PropertyType = z.infer<typeof PropertyTypeSchema>;
export const PropertyType = PropertyTypeSchema.enum;

export const FurnishingSchema = z.enum([
  'UNFURNISHED',
  'SEMI_FURNISHED',
  'FURNISHED',
]);
export type Furnishing = z.infer<typeof FurnishingSchema>;
export const Furnishing = FurnishingSchema.enum;

export const AdStatusSchema = z.enum(['NOT_POSTED', 'LIVE', 'TAKEN_DOWN']);
export type AdStatus = z.infer<typeof AdStatusSchema>;
export const AdStatus = AdStatusSchema.enum;

export const ReminderKindSchema = z.enum([
  'MANUAL',
  'AD_CHECK_IN',
  'AD_TAKE_DOWN',
]);
export type ReminderKind = z.infer<typeof ReminderKindSchema>;
export const ReminderKind = ReminderKindSchema.enum;

export const LanguageSchema = z.enum(['en', 'ar']);
export type Language = z.infer<typeof LanguageSchema>;
export const Language = LanguageSchema.enum;

export const ActivityTypeSchema = z.enum([
  'IMPORT',
  'ASSIGN',
  'DELETE',
  'RESTORE',
  'USER_CREATE',
  'USER_UPDATE',
  'USER_DEACTIVATE',
  'USER_REACTIVATE',
  'PASSWORD_RESET',
  'ROLE_CREATE',
  'ROLE_UPDATE',
  'ROLE_DELETE',
  'SETTINGS_UPDATE',
  'OUTCOME_UPDATE',
  'EXPORT',
]);
export type ActivityType = z.infer<typeof ActivityTypeSchema>;
export const ActivityType = ActivityTypeSchema.enum;
