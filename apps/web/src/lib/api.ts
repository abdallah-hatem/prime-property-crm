import 'server-only';
import { revalidateTag } from 'next/cache';
import { cookies, headers as nextHeaders } from 'next/headers';
import { redirect } from 'next/navigation';
import { DEFAULT_LOCALE, LOCALE_COOKIE, type Meta } from '@prime-crm/shared';
import type { ApiResult } from './api-result';
import { PATHNAME_HEADER } from './auth-proxy';
import { apiBaseUrl } from './env';
import { SIGN_OUT_PATH } from './routes';
import {
  ACCESS_COOKIE,
  REFRESH_COOKIE,
  refreshSession,
  sessionCookies,
} from './session-tokens';

/**
 * Server-side transport to the API: base URL, query params, the bearer from the httpOnly cookie,
 * Accept-Language, JSON bodies, cache tags, and the 401 path. `server-only` (not `"use server"`):
 * a generic fetcher must never become a server action a browser could call with any URL.
 */
export type ApiFetchOptions = Omit<RequestInit, 'body'> & {
  body?: unknown;
  /** false for public endpoints (login). */
  includeAuth?: boolean;
  params?: Record<string, string | number | boolean | string[] | undefined>;
  /** Tags to revalidate after a mutation. */
  revalidateTags?: string[];
  /** Return the 401 to the caller instead of refreshing / signing out. */
  ignore401?: boolean;
  /**
   * How a successful answer is read (a failure is always read as the API's error envelope):
   * - `envelope` (default): `data` and `meta` from the API's envelope;
   * - `raw`: the answer is not enveloped (the Blob upload handshake): `data` is the whole body;
   * - `binary`: a file (an export): `data` is a `BinaryFile`, its bytes base64-encoded so a server
   *   action can hand it to the browser.
   */
  response?: ResponseMode;
  /** Internal: this is the retry after an inline refresh. */
  _retried?: boolean;
};

export type ResponseMode = 'envelope' | 'raw' | 'binary';

/** A file answer (`response: 'binary'`). */
export interface BinaryFile {
  /** The bytes, base64-encoded. */
  base64: string;
  contentType: string;
  /** From `Content-Disposition`, when the API names the file. */
  fileName: string | null;
}

const RETRYABLE = new Set(['GET', 'HEAD', 'OPTIONS']);

function buildUrl(path: string, params: ApiFetchOptions['params']): string {
  const url = `${apiBaseUrl()}${path}`;
  if (!params) return url;
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined) continue;
    query.set(key, Array.isArray(value) ? value.join(',') : String(value));
  }
  const qs = query.toString();
  return qs ? `${url}${path.includes('?') ? '&' : '?'}${qs}` : url;
}

export async function apiFetch<T>(
  path: string,
  options: ApiFetchOptions = {},
): Promise<ApiResult<T>> {
  const {
    body,
    includeAuth = true,
    params,
    revalidateTags,
    ignore401,
    response = 'envelope',
    _retried,
    ...init
  } = options;
  const jar = await cookies();
  const isFormData = body instanceof FormData;

  const headers = new Headers(init.headers);
  headers.set('Accept', response === 'binary' ? '*/*' : 'application/json');
  if (body !== undefined && !isFormData)
    headers.set('Content-Type', 'application/json');
  if (!headers.has('Accept-Language'))
    headers.set(
      'Accept-Language',
      jar.get(LOCALE_COOKIE)?.value ?? DEFAULT_LOCALE,
    );
  const accessToken = jar.get(ACCESS_COOKIE)?.value;
  if (includeAuth && accessToken)
    headers.set('Authorization', `Bearer ${accessToken}`);

  const method = (init.method ?? 'GET').toUpperCase();
  const requestInit: RequestInit = {
    ...init,
    method,
    headers,
    body:
      body === undefined ? undefined : isFormData ? body : JSON.stringify(body),
  };

  let res: Response;
  try {
    res = await fetchOnceOrRetry(
      buildUrl(path, params),
      requestInit,
      RETRYABLE.has(method),
    );
  } catch (err) {
    console.error(
      '[apiFetch] network error:',
      err instanceof Error ? err.message : err,
    );
    return {
      success: false,
      status: 0,
      message: 'Network error',
      networkError: true,
    };
  }

  if (revalidateTags)
    for (const tag of revalidateTags) revalidateTag(tag, 'default');

  if (res.status === 401 && includeAuth && !ignore401 && !_retried) {
    return handleUnauthorized<T>(path, options, res);
  }
  return parseResponse<T>(res, response);
}

/** A stale pooled keep-alive socket throws "fetch failed" once; reads get one more try. */
async function fetchOnceOrRetry(
  url: string,
  init: RequestInit,
  retry: boolean,
): Promise<Response> {
  try {
    return await fetch(url, init);
  } catch (err) {
    if (!retry) throw err;
    await new Promise((r) => setTimeout(r, 150));
    return fetch(url, init);
  }
}

/**
 * 401 from the API. In a server action the cookies are writable: refresh inline, store the new
 * pair and retry once; if that fails, clear the session and report `unauthorized` (the client
 * then goes to login). In a render the cookies are read-only (and the proxy already refreshed),
 * so the session is dead: hand off to the sign-out route, which clears them and lands on login.
 */
async function handleUnauthorized<T>(
  path: string,
  options: ApiFetchOptions,
  res: Response,
): Promise<ApiResult<T>> {
  const hdrs = await nextHeaders();
  const jar = await cookies();
  if (!hdrs.has('next-action')) {
    const page = hdrs.get(PATHNAME_HEADER) ?? '/';
    redirect(`${SIGN_OUT_PATH}?next=${encodeURIComponent(page)}`);
  }

  const refreshToken = jar.get(REFRESH_COOKIE)?.value;
  const result = refreshToken ? await refreshSession(refreshToken) : null;
  if (result?.kind === 'ok') {
    for (const c of sessionCookies(result.pair))
      jar.set(c.name, c.value, c.options);
    return apiFetch<T>(path, { ...options, _retried: true });
  }
  if (result?.kind !== 'unavailable') {
    jar.delete(ACCESS_COOKIE);
    jar.delete(REFRESH_COOKIE);
  }
  const parsed = await parseResponse<T>(res);
  return {
    success: false,
    unauthorized: true,
    status: 401,
    message: parsed.message ?? 'Unauthorized',
    error: 'error' in parsed ? parsed.error : undefined,
  };
}

interface Envelope {
  success?: boolean;
  message?: unknown;
  data?: unknown;
  meta?: Meta;
  error?: unknown;
}

/** `filename*=UTF-8''…` (preferred) or `filename="…"` from a Content-Disposition header. */
function fileNameOf(disposition: string | null): string | null {
  if (!disposition) return null;
  const encoded = /filename\*=UTF-8''([^;]+)/i.exec(disposition)?.[1];
  if (encoded) {
    try {
      return decodeURIComponent(encoded.trim());
    } catch {
      // Malformed: fall back to the plain name.
    }
  }
  return /filename="?([^";]+)"?/i.exec(disposition)?.[1]?.trim() ?? null;
}

async function parseResponse<T>(
  res: Response,
  response: ResponseMode = 'envelope',
): Promise<ApiResult<T>> {
  if (res.ok && response === 'binary') {
    const file: BinaryFile = {
      base64: Buffer.from(await res.arrayBuffer()).toString('base64'),
      contentType:
        res.headers.get('content-type') ?? 'application/octet-stream',
      fileName: fileNameOf(res.headers.get('content-disposition')),
    };
    return { success: true, status: res.status, data: file as T };
  }
  const isJson = res.headers.get('content-type')?.includes('json');
  const body: unknown = isJson
    ? await res.json().catch(() => null)
    : await res.text();
  const envelope: Envelope =
    typeof body === 'object' && body !== null && !Array.isArray(body)
      ? (body as Envelope)
      : { data: body };
  const message =
    typeof envelope.message === 'string' ? envelope.message : undefined;

  if (!res.ok) {
    return {
      success: false,
      status: res.status,
      error: typeof envelope.error === 'string' ? envelope.error : undefined,
      message: message ?? 'An error occurred',
      data: envelope.data,
    };
  }
  if (response === 'raw')
    return { success: true, status: res.status, data: body as T };
  return {
    success: true,
    status: res.status,
    data: envelope.data as T,
    meta: envelope.meta,
    message,
  };
}
