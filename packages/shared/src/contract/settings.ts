import { z } from 'zod';
import { AD_CHECK_IN_DAYS_MAX, AD_CHECK_IN_DAYS_MIN } from './outcomes';

/**
 * Settings contract (spec, "Trash, activity, settings"). `GET /settings` is open to any
 * signed-in user; `PATCH /settings` needs `settings.manage`.
 * `apps/api/src/domains/settings/dto/settings-contract.spec.ts` checks the API DTO agrees.
 */

/** `GET /settings` and the `PATCH /settings` answer. */
export const SettingsSchema = z.object({
  /** Days between ad check-ins; applies to check-ins scheduled after a change. */
  adCheckInDays: z.number().int().min(AD_CHECK_IN_DAYS_MIN).max(AD_CHECK_IN_DAYS_MAX),
});
export type Settings = z.infer<typeof SettingsSchema>;

/** `PATCH /settings`: a whole number of days, 1–90. */
export const UpdateSettingsRequestSchema = z.strictObject({
  adCheckInDays: z
    .number()
    .int()
    .min(AD_CHECK_IN_DAYS_MIN)
    .max(AD_CHECK_IN_DAYS_MAX),
});
export type UpdateSettingsRequest = z.infer<typeof UpdateSettingsRequestSchema>;
