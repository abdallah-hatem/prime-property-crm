import { applyDecorators } from '@nestjs/common';
import { IsISO8601, Matches } from 'class-validator';

/** A Cairo date (YYYY-MM-DD) or a full ISO instant; week and ordinal ISO forms are refused. */
const DATE_OR_INSTANT = /^\d{4}-\d{2}-\d{2}(T.+)?$/;
const DATE_MESSAGE = '$property must be a date (YYYY-MM-DD) or an ISO instant';

/**
 * A `from`/`to` filter bound: a Cairo date or an ISO instant. Resolve it with
 * `rangeBound(value, side)` (common/utils/cairo-date.util).
 */
export const IsDateOrInstant = () =>
  applyDecorators(
    Matches(DATE_OR_INSTANT, { message: DATE_MESSAGE }),
    IsISO8601({ strict: true }, { message: DATE_MESSAGE }),
  );
