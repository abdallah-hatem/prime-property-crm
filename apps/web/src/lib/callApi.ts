import type { ApiResult } from './api-result';
import { handleResponse, type HandleResponseOptions } from './handleResponse';

/**
 * How a client component calls an endpoint from `src/apis.ts`: await the server action, then run
 * `handleResponse` in the browser so its toast actually shows.
 */
export async function callApi<R extends ApiResult<unknown>>(
  request: Promise<R>,
  options: HandleResponseOptions = {},
): Promise<R> {
  const response = await request;
  return handleResponse(response, options);
}
