import { AD_CHECK_IN_DAYS_MAX, AD_CHECK_IN_DAYS_MIN } from '@prime-crm/shared';
import { IsInt, Max, Min } from 'class-validator';

/** `PATCH /settings` (mirrors UpdateSettingsRequestSchema): whole days, 1–90. */
export class UpdateSettingsDto {
  @IsInt()
  @Min(AD_CHECK_IN_DAYS_MIN)
  @Max(AD_CHECK_IN_DAYS_MAX)
  adCheckInDays!: number;
}
