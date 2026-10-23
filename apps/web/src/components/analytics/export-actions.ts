'use server';

import { z } from 'zod';
import {
  exportFileName,
  ListingListQuerySchema,
  OwnerListQuerySchema,
  type ExportKind,
} from '@prime-crm/shared';
import { apiFetch, type BinaryFile } from '@/lib/api';
import type { ApiResult } from '@/lib/api-result';
import { toCairo } from '@/lib/cairo-time';
import { handleResponse } from '@/lib/handleResponse';

/**
 * Excel exports (`GET /exports/owners`, `GET /exports/listings`, data.export). The API answers
 * the file itself, so `apiFetch` reads it in binary mode (an expired session is refreshed and the
 * download retried, like any call) and the browser gets it as base64. Errors are the usual
 * envelope: EXPORT_TOO_LARGE, VALIDATION_FAILED, FORBIDDEN.
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

type ExportParams = Record<
  string,
  string | number | boolean | string[] | undefined
>;

/** The filters as query params; empty values are left out. */
function toParams(filters: Record<string, unknown>): ExportParams {
  const params: ExportParams = {};
  for (const [key, value] of Object.entries(filters)) {
    if (value === undefined || value === null || value === '') continue;
    params[key] = Array.isArray(value)
      ? value.map(String)
      : (value as string | number | boolean);
  }
  return params;
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

  const res = await apiFetch<BinaryFile>(`/exports/${parsedKind.data}`, {
    params: toParams(params),
    response: 'binary',
    cache: 'no-store',
  });
  if (!res.success) return handleResponse(res);
  return {
    success: true,
    status: res.status,
    data: {
      fileName:
        res.data.fileName ??
        exportFileName(parsedKind.data, toCairo(new Date()).day),
      base64: res.data.base64,
    },
  };
}
