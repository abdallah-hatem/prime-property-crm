import type { Meta } from '@prime-crm/shared';

/**
 * What every endpoint in `src/apis.ts` returns. `apiFetch` never throws for an API failure; it
 * returns one of these, and callers check `unauthorized` first, then `success`.
 */
export type ApiSuccess<T> = {
  success: true;
  status: number;
  data: T;
  meta?: Meta;
  message?: string;
};

export type ApiFailure = {
  success: false;
  /** HTTP status; 0 when the API couldn't be reached. */
  status: number;
  /** The API's stable error code (INVALID_CREDENTIALS, TOO_MANY_REQUESTS, …). */
  error?: string;
  /** The API's English sentence: logs and fallbacks only; the UI shows the translated code. */
  message: string;
  /** Field errors, when the API sent them. */
  data?: unknown;
  networkError?: boolean;
};

export type ApiUnauthorized = {
  success: false;
  unauthorized: true;
  status: 401;
  message: string;
  error?: string;
};

export type ApiResult<T> = ApiSuccess<T> | ApiFailure | ApiUnauthorized;

export const isUnauthorized = <T>(res: ApiResult<T>): res is ApiUnauthorized =>
  'unauthorized' in res && res.unauthorized === true;
