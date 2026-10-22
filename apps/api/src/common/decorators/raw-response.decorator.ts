import { SetMetadata } from '@nestjs/common';

export const RAW_RESPONSE_KEY = 'rawResponse';

/**
 * Leaves a route's return value out of the envelope (spec, Conventions: the Vercel Blob upload
 * handshake and Excel exports). Errors are still enveloped by the exception filter.
 */
export const RawResponse = () => SetMetadata(RAW_RESPONSE_KEY, true);
