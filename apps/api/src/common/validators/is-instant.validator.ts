import { applyDecorators } from '@nestjs/common';
import { IsISO8601, Matches } from 'class-validator';

/** Date, `T`, time, then `Z` or an offset: the shared `InstantSchema` (zod `iso.datetime`). */
const INSTANT =
  /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d+)?)?(Z|[+-]\d{2}:\d{2})$/;
const MESSAGE =
  '$property must be an ISO 8601 instant with a zone (e.g. 2026-10-22T09:00:00Z)';

/** An ISO 8601 instant with its zone; a bare date or a zone-less time is refused. */
export const IsInstant = () =>
  applyDecorators(
    Matches(INSTANT, { message: MESSAGE }),
    IsISO8601({ strict: true }, { message: MESSAGE }),
  );
