import { messages } from '@prime-crm/shared';
import type { MessageKey, Translate } from '@/i18n/translate';
import type { ApiFailure, ApiUnauthorized } from '@/lib/api-result';
import { errorMessage } from '@/lib/error-message';

const hasListingKey = (code: string): boolean =>
  Object.prototype.hasOwnProperty.call(messages.en.listings.error, code);

/**
 * The translated message for a failed listing call: the listing / photo domain codes
 * (OWNER_ALREADY_LISTED, PHONE_IN_LISTING, AD_LINK_REQUIRED, …) live under `listings.error`,
 * everything else falls back to the shared `error.<CODE>` lookup.
 */
export function listingErrorMessage(
  t: Translate,
  res: ApiFailure | ApiUnauthorized,
): string {
  if (res.error && hasListingKey(res.error))
    return t(`listings.error.${res.error}` as MessageKey);
  return errorMessage(t, res);
}
