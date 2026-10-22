import { IsOptional, Matches } from 'class-validator';

const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;
const MESSAGE = '$property must be a date (YYYY-MM-DD)';

/** `?from=YYYY-MM-DD&to=YYYY-MM-DD` (Cairo dates, both included). Mirrors AnalyticsRangeQuerySchema. */
export class AnalyticsQueryDto {
  @IsOptional()
  @Matches(DATE_ONLY, { message: MESSAGE })
  from?: string;

  @IsOptional()
  @Matches(DATE_ONLY, { message: MESSAGE })
  to?: string;
}
