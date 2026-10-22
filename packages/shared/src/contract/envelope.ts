/**
 * The response envelope every JSON endpoint returns (spec, "Conventions" → Envelope).
 * Exceptions: Excel exports and the Vercel Blob upload handshake.
 */

/** Pagination metadata: exactly what the API's BaseRepository returns besides `data`. */
export interface Meta {
  total: number;
  page: number;
  limit: number;
  hasNextPage: boolean;
  hasPreviousPage: boolean;
}

export interface Paginated<T> extends Meta {
  data: T[];
}

export interface ApiResponse<T = unknown> {
  success: boolean;
  /** An English sentence for logs and fallbacks; the web shows the translated `error` code. */
  message: string;
  statusCode: number;
  data?: T;
  meta?: Meta;
  /** A stable machine code: see `ErrorCode` and the per-endpoint domain codes. */
  error?: string;
  timestamp: string;
  path?: string;
}

/** Page-size caps from the contract: 20 for lists, 100 for endpoints marked *picker*. */
export const PAGE_LIMIT_MAX = 20;
export const PICKER_LIMIT_MAX = 100;
