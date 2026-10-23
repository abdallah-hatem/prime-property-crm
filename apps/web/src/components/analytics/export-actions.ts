'use server';

import { cookies } from 'next/headers';
import { z } from 'zod';
import {
  DEFAULT_LOCALE,
  EXPORT_CONTENT_TYPE,
  exportFileName,
  ListingListQuerySchema,
  LOCALE_COOKIE,
  OwnerListQuerySchema,
  type ExportKind,
} from '@prime-crm/shared';
import type { ApiResult } from '@/lib/api-result';
import { toCairo } from '@/lib/cairo-time';
import { apiBaseUrl } from '@/lib/env';
import { handleResponse } from '@/lib/handleResponse';
import { ACCESS_COOKIE } from '@/lib/session-tokens';

/**
 * Excel exports (`GET /exports/owners`, `GET /exports/listings`, data.export). The API answers
 * the file itself, not the envelope, and `apiFetch` reads a non-JSON body as text (which would
 * corrupt the workbook), so this action reads the bytes itself and hands the browser the file as
 * base64. Errors are the usual envelope: EXPORT_TOO_LARGE, VALIDATION_FAILED, FORBIDDEN.
 */

export interface ExportFile {
  fileName: string;
  /** The `.xlsx` bytes, base64. */
  base64: string;
}

const KindSchema = z.enum(['owners', 'listings']);
const OwnerExportQuerySchema = OwnerListQuerySchema.omit({
  page: true,
  limit: true,
});

/** The list filters without paging; anything else is refused before the API is called. */
function exportQuery(
  kind: ExportKind,
  query: unknown,
): Record<string, unknown> | null {
  if (kind === 'owners') {
    const parsed = OwnerExportQuerySchema.safeParse(query);
    return parsed.success ? parsed.data : null;
  }
  const parsed = ListingListQuerySchema.safeParse(query);
  if (!parsed.success) return null;
  // eslint-disable-next-line @typescript-eslint/no-unused-vars -- paging is dropped on purpose
  const { page, limit, ...filters } = parsed.data;
  return filters;
}

function toSearch(params: Record<string, unknown>): string {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === null || value === '') continue;
    search.set(key, Array.isArray(value) ? value.join(',') : String(value));
  }
  const qs = search.toString();
  return qs ? `?${qs}` : '';
}

const fileNameOf = (disposition: string | null, kind: ExportKind): string =>
  /filename="?([^";]+)"?/.exec(disposition ?? '')?.[1] ??
  exportFileName(kind, toCairo(new Date()).day);

async function failureOf(res: Response): Promise<ApiResult<never>> {
  const body: unknown = await res.json().catch(() => null);
  const envelope =
    typeof body === 'object' && body !== null
      ? (body as { error?: unknown; message?: unknown })
      : {};
  const message =
    typeof envelope.message === 'string'
      ? envelope.message
      : 'An error occurred';
  if (res.status === 401)
    return { success: false, unauthorized: true, status: 401, message };
  return {
    success: false,
    status: res.status,
    error: typeof envelope.error === 'string' ? envelope.error : undefined,
    message,
  };
}

/** Download the owners or listings matching `query` (the list's current filters). */
export async function DOWNLOAD_EXPORT(
  kind: ExportKind,
  query: unknown,
): Promise<ApiResult<ExportFile>> {
  const parsedKind = KindSchema.safeParse(kind);
  const params = parsedKind.success
    ? exportQuery(parsedKind.data, query)
    : null;
  if (!parsedKind.success || !params)
    return {
      success: false,
      status: 400,
      error: 'VALIDATION_FAILED',
      message: 'Invalid input',
    };

  const jar = await cookies();
  const headers = new Headers({
    Accept: `${EXPORT_CONTENT_TYPE}, application/json`,
    'Accept-Language': jar.get(LOCALE_COOKIE)?.value ?? DEFAULT_LOCALE,
  });
  const token = jar.get(ACCESS_COOKIE)?.value;
  if (token) headers.set('Authorization', `Bearer ${token}`);

  let res: Response;
  try {
    // eslint-disable-next-line no-restricted-globals -- binary body: apiFetch can only read JSON or text
    res = await fetch(
      `${apiBaseUrl()}/exports/${parsedKind.data}${toSearch(params)}`,
      { headers, cache: 'no-store' },
    );
  } catch {
    return {
      success: false,
      status: 0,
      message: 'Network error',
      networkError: true,
    };
  }

  if (!res.ok) return handleResponse(await failureOf(res));
  const bytes = Buffer.from(await res.arrayBuffer());
  return {
    success: true,
    status: res.status,
    data: {
      fileName: fileNameOf(
        res.headers.get('content-disposition'),
        parsedKind.data,
      ),
      base64: bytes.toString('base64'),
    },
  };
}
