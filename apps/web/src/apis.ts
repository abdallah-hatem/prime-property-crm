'use server';

import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { z } from 'zod';
import {
  AdCheckInRequestSchema,
  AreaLookupQuerySchema,
  AssignOwnersRequestSchema,
  CreateListingRequestSchema,
  CreateNoteRequestSchema,
  CreateReminderRequestSchema,
  IMPORT_FILE_EXTENSIONS,
  IMPORT_MAX_BYTES,
  ImportIssuesQuerySchema,
  ImportListQuerySchema,
  LanguageSchema,
  ListingListQuerySchema,
  ListingPhotoUploadRequestSchema,
  ListingStatusRequestSchema,
  LOCALE_COOKIE,
  LoginRequestSchema,
  OwnerIdsQuerySchema,
  OwnerListQuerySchema,
  PAGE_LIMIT_MAX,
  PICKER_LIMIT_MAX,
  PreviewImportRequestSchema,
  RegisterPhotoRequestSchema,
  ReminderKindSchema,
  ReminderStateSchema,
  ReminderWhenSchema,
  ReorderPhotosRequestSchema,
  SetCallOutcomeRequestSchema,
  StartCallRequestSchema,
  UpdateAdRequestSchema,
  UpdateListingRequestSchema,
  UpdateOwnerRequestSchema,
  UpdateReminderRequestSchema,
  UploadImportRequestSchema,
  type AreaOption,
  type AssignOwnersResponse,
  type Call,
  type CallOutcome,
  type ImportIssue,
  type ImportJob,
  type ImportPreview,
  type Language,
  type Listing,
  type ListingRow,
  type LoginResponse,
  type Me,
  type Note,
  type Owner,
  type OwnerIdsResponse,
  type OwnerListQuery,
  type OwnerRow,
  type OwnerTimelineItem,
  type Photo,
  type Reminder,
  type Today,
  type UserSummary,
} from '@prime-crm/shared';
import { apiFetch } from '@/lib/api';
import { apiBaseUrl } from '@/lib/env';
import type { ApiResult } from '@/lib/api-result';
import { handleResponse } from '@/lib/handleResponse';
import { homeFor, LOGIN_PATH, safeReturnPath } from '@/lib/routes';
import {
  ACCESS_COOKIE,
  REFRESH_COOKIE,
  sessionCookies,
} from '@/lib/session-tokens';

/**
 * Endpoints: one server action per API route. Every argument is re-validated here — each export
 * is a public HTTP endpoint a browser can call with any payload. Tokens never leave the server:
 * an action stores them in httpOnly cookies and returns only what the page needs.
 */

const invalid = (): ApiResult<never> => ({
  success: false,
  status: 400,
  error: 'VALIDATION_FAILED',
  message: 'Invalid input',
});

const ONE_YEAR_SECONDS = 60 * 60 * 24 * 365;

/** Sign in. On success the session cookies are set and the page is told where to go. */
export async function LOGIN(
  input: unknown,
  next?: string | null,
): Promise<ApiResult<{ redirectTo: string }>> {
  const parsed = LoginRequestSchema.safeParse(input);
  if (!parsed.success) return invalid();

  const res = await apiFetch<LoginResponse>('/auth/login', {
    method: 'POST',
    body: parsed.data,
    includeAuth: false,
    cache: 'no-store',
  });
  if (!res.success) return handleResponse({ ...res, data: undefined });

  const jar = await cookies();
  for (const c of sessionCookies(res.data)) jar.set(c.name, c.value, c.options);
  // A first sign-in on this device opens in the user's own language.
  if (!jar.has(LOCALE_COOKIE))
    jar.set(LOCALE_COOKIE, res.data.user.language, {
      path: '/',
      maxAge: ONE_YEAR_SECONDS,
      sameSite: 'lax',
    });

  const redirectTo = safeReturnPath(next) ?? homeFor(res.data.user.permissions);
  return { success: true, status: res.status, data: { redirectTo } };
}

/** Sign out: revoke the refresh token's family, clear the cookies, go to login. */
export async function LOGOUT(): Promise<void> {
  const jar = await cookies();
  const refreshToken = jar.get(REFRESH_COOKIE)?.value;
  if (refreshToken)
    await apiFetch<null>('/auth/logout', {
      method: 'POST',
      body: { refreshToken },
      ignore401: true,
    });
  jar.delete(ACCESS_COOKIE);
  jar.delete(REFRESH_COOKIE);
  redirect(LOGIN_PATH);
}

/** The signed-in user with live permissions. */
export async function GET_ME(): Promise<ApiResult<Me>> {
  const res = await apiFetch<Me>('/auth/me', { cache: 'no-store' });
  return handleResponse(res);
}

/** Save the language on the account, so the next sign-in on any device opens in it. */
export async function UPDATE_MY_LANGUAGE(
  language: Language,
): Promise<ApiResult<Me>> {
  const parsed = LanguageSchema.safeParse(language);
  if (!parsed.success) return invalid();
  const res = await apiFetch<Me>('/auth/me', {
    method: 'PATCH',
    body: { language: parsed.data },
  });
  return handleResponse(res);
}

/* ------------------------------------------------------------ calling (T13) */

const IdSchema = z.uuid();
const PageSchema = z.coerce.number().int().min(1).max(10_000);

/** The member's Today: outcome missing, overdue, due today, ad tasks and counts. */
export async function GET_TODAY(): Promise<ApiResult<Today>> {
  return handleResponse(
    await apiFetch<Today>('/me/today', { cache: 'no-store' }),
  );
}

/** One page of the member's calling list, in calling order. */
export async function GET_CALLING_LIST(
  page: number = 1,
): Promise<ApiResult<OwnerRow[]>> {
  const parsed = PageSchema.safeParse(page);
  if (!parsed.success) return invalid();
  const res = await apiFetch<OwnerRow[]>('/owners/calling-list', {
    params: { page: parsed.data, limit: PAGE_LIMIT_MAX },
    cache: 'no-store',
  });
  return handleResponse(res);
}

/** Owners list (own only without owners.viewAll), with the contract's filters. */
export async function GET_OWNERS(
  query: OwnerListQuery,
): Promise<ApiResult<OwnerRow[]>> {
  const parsed = OwnerListQuerySchema.safeParse(query);
  if (!parsed.success) return invalid();
  const { status, ...rest } = parsed.data;
  const res = await apiFetch<OwnerRow[]>('/owners', {
    params: { ...rest, status },
    cache: 'no-store',
  });
  return handleResponse(res);
}

export async function GET_OWNER(id: string): Promise<ApiResult<Owner>> {
  if (!IdSchema.safeParse(id).success) return invalid();
  return handleResponse(
    await apiFetch<Owner>(`/owners/${id}`, { cache: 'no-store' }),
  );
}

export async function GET_OWNER_TIMELINE(
  id: string,
  page: number = 1,
): Promise<ApiResult<OwnerTimelineItem[]>> {
  if (!IdSchema.safeParse(id).success || !PageSchema.safeParse(page).success)
    return invalid();
  const res = await apiFetch<OwnerTimelineItem[]>(`/owners/${id}/timeline`, {
    params: { page, limit: PAGE_LIMIT_MAX },
    cache: 'no-store',
  });
  return handleResponse(res);
}

/** Set (`true`) or clear (`false`, owners.viewAll) Do not call. */
export async function SET_OWNER_DO_NOT_CALL(
  id: string,
  doNotCall: boolean,
): Promise<ApiResult<Owner>> {
  const parsed = UpdateOwnerRequestSchema.safeParse({ doNotCall });
  if (!IdSchema.safeParse(id).success || !parsed.success) return invalid();
  return handleResponse(
    await apiFetch<Owner>(`/owners/${id}`, {
      method: 'PATCH',
      body: parsed.data,
    }),
  );
}

export async function ADD_OWNER_NOTE(
  id: string,
  input: unknown,
): Promise<ApiResult<Note>> {
  const parsed = CreateNoteRequestSchema.safeParse(input);
  if (!IdSchema.safeParse(id).success || !parsed.success) return invalid();
  return handleResponse(
    await apiFetch<Note>(`/owners/${id}/notes`, {
      method: 'POST',
      body: parsed.data,
    }),
  );
}

/** Start a call. A repeated `clientRequestId` returns the call already made. */
export async function START_CALL(
  ownerId: string,
  input: unknown,
): Promise<ApiResult<Call>> {
  const parsed = StartCallRequestSchema.safeParse(input);
  if (!IdSchema.safeParse(ownerId).success || !parsed.success) return invalid();
  return handleResponse(
    await apiFetch<Call>(`/owners/${ownerId}/calls`, {
      method: 'POST',
      body: parsed.data,
    }),
  );
}

export async function SET_CALL_OUTCOME(
  callId: string,
  input: unknown,
): Promise<ApiResult<Call>> {
  const parsed = SetCallOutcomeRequestSchema.safeParse(input);
  if (!IdSchema.safeParse(callId).success || !parsed.success) return invalid();
  return handleResponse(
    await apiFetch<Call>(`/calls/${callId}/outcome`, {
      method: 'POST',
      body: parsed.data,
    }),
  );
}

/** The visible outcomes, in order (one picker page holds them all). */
export async function GET_CALL_OUTCOMES(): Promise<ApiResult<CallOutcome[]>> {
  return handleResponse(
    await apiFetch<CallOutcome[]>('/call-outcomes', { cache: 'no-store' }),
  );
}

const ReminderListQuerySchema = z.strictObject({
  state: ReminderStateSchema.optional(),
  when: ReminderWhenSchema.optional(),
  kind: ReminderKindSchema.optional(),
  page: PageSchema.optional(),
});

/** The caller's own reminders: open first by due time, then done. */
export async function GET_REMINDERS(
  query: z.input<typeof ReminderListQuerySchema>,
): Promise<ApiResult<Reminder[]>> {
  const parsed = ReminderListQuerySchema.safeParse(query);
  if (!parsed.success) return invalid();
  return handleResponse(
    await apiFetch<Reminder[]>('/reminders', {
      params: { ...parsed.data, limit: PAGE_LIMIT_MAX },
      cache: 'no-store',
    }),
  );
}

export async function CREATE_REMINDER(
  input: unknown,
): Promise<ApiResult<Reminder>> {
  const parsed = CreateReminderRequestSchema.safeParse(input);
  if (!parsed.success) return invalid();
  return handleResponse(
    await apiFetch<Reminder>('/reminders', {
      method: 'POST',
      body: parsed.data,
    }),
  );
}

export async function UPDATE_REMINDER(
  id: string,
  input: unknown,
): Promise<ApiResult<Reminder>> {
  const parsed = UpdateReminderRequestSchema.safeParse(input);
  if (!IdSchema.safeParse(id).success || !parsed.success) return invalid();
  return handleResponse(
    await apiFetch<Reminder>(`/reminders/${id}`, {
      method: 'PATCH',
      body: parsed.data,
    }),
  );
}

export async function MARK_REMINDER_DONE(
  id: string,
): Promise<ApiResult<Reminder>> {
  if (!IdSchema.safeParse(id).success) return invalid();
  return handleResponse(
    await apiFetch<Reminder>(`/reminders/${id}/done`, { method: 'POST' }),
  );
}

// ============================================================== listings (T14) — begin
// Listings, the Property Finder ad, notes and photos (spec, "Listings — /listings" and "Photos").

const LISTINGS_TAG = 'listings';
const listingTag = (id: string) => `listing:${id}`;

/** `GET /listings`: the search, every filter in the URL. Rows never carry the owner phone. */
export async function SEARCH_LISTINGS(
  query: unknown,
): Promise<ApiResult<ListingRow[]>> {
  const parsed = ListingListQuerySchema.safeParse(query);
  if (!parsed.success) return invalid();
  const res = await apiFetch<ListingRow[]>('/listings', {
    params: parsed.data,
    cache: 'no-store',
    next: { tags: [LISTINGS_TAG] },
  });
  return handleResponse(res);
}

/** `GET /listings/:id`: the owner phone is null (and flagged hidden) unless the caller may see it. */
export async function GET_LISTING(id: string): Promise<ApiResult<Listing>> {
  if (!IdSchema.safeParse(id).success) return invalid();
  const res = await apiFetch<Listing>(`/listings/${id}`, {
    cache: 'no-store',
    next: { tags: [listingTag(id)] },
  });
  return handleResponse(res);
}

/** The owner a listing is created from (`?ownerId=`): name and area prefill the form. */
export async function GET_LISTING_SOURCE_OWNER(
  ownerId: string,
): Promise<ApiResult<Owner>> {
  if (!IdSchema.safeParse(ownerId).success) return invalid();
  const res = await apiFetch<Owner>(`/owners/${ownerId}`, {
    cache: 'no-store',
  });
  return handleResponse(res);
}

export async function CREATE_LISTING(
  body: unknown,
): Promise<ApiResult<Listing>> {
  const parsed = CreateListingRequestSchema.safeParse(body);
  if (!parsed.success) return invalid();
  const res = await apiFetch<Listing>('/listings', {
    method: 'POST',
    body: parsed.data,
    revalidateTags: [LISTINGS_TAG],
  });
  return handleResponse(res);
}

export async function UPDATE_LISTING(
  id: string,
  body: unknown,
): Promise<ApiResult<Listing>> {
  const parsed = UpdateListingRequestSchema.safeParse(body);
  if (!IdSchema.safeParse(id).success || !parsed.success) return invalid();
  const res = await apiFetch<Listing>(`/listings/${id}`, {
    method: 'PATCH',
    body: parsed.data,
    revalidateTags: [LISTINGS_TAG, listingTag(id)],
  });
  return handleResponse(res);
}

export async function SET_LISTING_STATUS(
  id: string,
  body: unknown,
): Promise<ApiResult<Listing>> {
  const parsed = ListingStatusRequestSchema.safeParse(body);
  if (!IdSchema.safeParse(id).success || !parsed.success) return invalid();
  const res = await apiFetch<Listing>(`/listings/${id}/status`, {
    method: 'POST',
    body: parsed.data,
    revalidateTags: [LISTINGS_TAG, listingTag(id)],
  });
  return handleResponse(res);
}

export async function UPDATE_LISTING_AD(
  id: string,
  body: unknown,
): Promise<ApiResult<Listing>> {
  const parsed = UpdateAdRequestSchema.safeParse(body);
  if (!IdSchema.safeParse(id).success || !parsed.success) return invalid();
  const res = await apiFetch<Listing>(`/listings/${id}/ad`, {
    method: 'PUT',
    body: parsed.data,
    revalidateTags: [LISTINGS_TAG, listingTag(id)],
  });
  return handleResponse(res);
}

export async function LOG_LISTING_CHECK_IN(
  id: string,
  body: unknown,
): Promise<ApiResult<Listing>> {
  const parsed = AdCheckInRequestSchema.safeParse(body);
  if (!IdSchema.safeParse(id).success || !parsed.success) return invalid();
  const res = await apiFetch<Listing>(`/listings/${id}/ad/check-in`, {
    method: 'POST',
    body: parsed.data,
    revalidateTags: [LISTINGS_TAG, listingTag(id)],
  });
  return handleResponse(res);
}

export async function DELETE_LISTING(id: string): Promise<ApiResult<null>> {
  if (!IdSchema.safeParse(id).success) return invalid();
  const res = await apiFetch<null>(`/listings/${id}`, {
    method: 'DELETE',
    revalidateTags: [LISTINGS_TAG, listingTag(id)],
  });
  return handleResponse(res);
}

export async function ADD_LISTING_NOTE(
  id: string,
  body: unknown,
): Promise<ApiResult<Note>> {
  const parsed = CreateNoteRequestSchema.safeParse(body);
  if (!IdSchema.safeParse(id).success || !parsed.success) return invalid();
  const res = await apiFetch<Note>(`/listings/${id}/notes`, {
    method: 'POST',
    body: parsed.data,
    revalidateTags: [listingTag(id)],
  });
  return handleResponse(res);
}

/** Registers a file the browser already uploaded to Blob (see listing-photo upload route). */
export async function REGISTER_LISTING_PHOTO(
  id: string,
  body: unknown,
): Promise<ApiResult<Photo>> {
  const parsed = RegisterPhotoRequestSchema.safeParse(body);
  if (!IdSchema.safeParse(id).success || !parsed.success) return invalid();
  const res = await apiFetch<Photo>(`/listings/${id}/photos`, {
    method: 'POST',
    body: parsed.data,
    revalidateTags: [LISTINGS_TAG, listingTag(id)],
  });
  return handleResponse(res);
}

export async function REORDER_LISTING_PHOTOS(
  id: string,
  body: unknown,
): Promise<ApiResult<Photo[]>> {
  const parsed = ReorderPhotosRequestSchema.safeParse(body);
  if (!IdSchema.safeParse(id).success || !parsed.success) return invalid();
  const res = await apiFetch<Photo[]>(`/listings/${id}/photos/order`, {
    method: 'PUT',
    body: parsed.data,
    revalidateTags: [LISTINGS_TAG, listingTag(id)],
  });
  return handleResponse(res);
}

export async function DELETE_LISTING_PHOTO(
  id: string,
  photoId: string,
): Promise<ApiResult<null>> {
  if (!IdSchema.safeParse(id).success || !IdSchema.safeParse(photoId).success)
    return invalid();
  const res = await apiFetch<null>(`/listings/${id}/photos/${photoId}`, {
    method: 'DELETE',
    revalidateTags: [LISTINGS_TAG, listingTag(id)],
  });
  return handleResponse(res);
}

/** `GET /lookups/areas` (picker): areas with their compounds, from owners and listings. */
export async function LOOKUP_LISTING_AREAS(
  query: unknown,
): Promise<ApiResult<AreaOption[]>> {
  const parsed = AreaLookupQuerySchema.safeParse(query);
  if (!parsed.success) return invalid();
  const res = await apiFetch<AreaOption[]>('/lookups/areas', {
    params: parsed.data,
    cache: 'no-store',
  });
  return handleResponse(res);
}

/**
 * The Blob client-upload handshake (`POST /uploads/listing-photo`): the API answers with a
 * short-lived client token for one file in this listing's folder; the browser then `put`s the file
 * straight to Blob with it. The answer is raw (not enveloped), so this reads it itself.
 */
export async function REQUEST_LISTING_PHOTO_TOKEN(
  listingId: string,
  pathname: string,
): Promise<ApiResult<{ clientToken: string }>> {
  if (!IdSchema.safeParse(listingId).success) return invalid();
  const body = ListingPhotoUploadRequestSchema.safeParse({
    type: 'blob.generate-client-token',
    payload: { pathname, clientPayload: JSON.stringify({ listingId }) },
  });
  if (!body.success) return invalid();
  const jar = await cookies();
  const accessToken = jar.get(ACCESS_COOKIE)?.value;
  let res: Response;
  try {
    // eslint-disable-next-line no-restricted-globals -- the handshake answer is not enveloped, and apiFetch only returns enveloped data
    res = await fetch(`${apiBaseUrl()}/uploads/listing-photo`, {
      method: 'POST',
      cache: 'no-store',
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
        ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
      },
      body: JSON.stringify(body.data),
    });
  } catch {
    return handleResponse({
      success: false,
      status: 0,
      message: 'Network error',
      networkError: true,
    });
  }
  const json: unknown = await res.json().catch(() => null);
  const record =
    typeof json === 'object' && json !== null
      ? (json as Record<string, unknown>)
      : {};
  if (res.ok && typeof record.clientToken === 'string')
    return {
      success: true,
      status: res.status,
      data: { clientToken: record.clientToken },
    };
  if (res.status === 401)
    return handleResponse({
      success: false,
      unauthorized: true,
      status: 401,
      message: 'Unauthorized',
    });
  return handleResponse({
    success: false,
    status: res.status,
    error: typeof record.error === 'string' ? record.error : undefined,
    message:
      typeof record.message === 'string' ? record.message : 'Upload refused',
  });
}
// ============================================================== listings (T14) — end

// ====== owners-admin + imports (T15) — begin
// Admin owners table (ids for "select all" / "next N unassigned", bulk assign, the assignee
// picker) and the import wizard (spec, "Owners — /owners" and "Imports — /imports").

const OWNERS_TAG = 'owners';
const IMPORTS_TAG = 'imports';

/** `GET /owners/ids`: every matching owner id (≤ `take`, max 5000) and the full count. */
export async function GET_OWNER_IDS(
  query: unknown,
): Promise<ApiResult<OwnerIdsResponse>> {
  const parsed = OwnerIdsQuerySchema.safeParse(query);
  if (!parsed.success) return invalid();
  const res = await apiFetch<OwnerIdsResponse>('/owners/ids', {
    params: parsed.data,
    cache: 'no-store',
  });
  return handleResponse(res);
}

/** `POST /owners/assign`: owners (≤ 5000) to an active member, or `null` = unassigned. */
export async function ASSIGN_OWNERS(
  input: unknown,
): Promise<ApiResult<AssignOwnersResponse>> {
  const parsed = AssignOwnersRequestSchema.safeParse(input);
  if (!parsed.success) return invalid();
  return handleResponse(
    await apiFetch<AssignOwnersResponse>('/owners/assign', {
      method: 'POST',
      body: parsed.data,
      revalidateTags: [OWNERS_TAG],
    }),
  );
}

/** `GET /users/options?active=true`: the active users work can go to, by name (one picker page). */
export async function GET_ASSIGNEE_OPTIONS(): Promise<
  ApiResult<UserSummary[]>
> {
  return handleResponse(
    await apiFetch<UserSummary[]>('/users/options', {
      params: { active: true, limit: PICKER_LIMIT_MAX },
      cache: 'no-store',
    }),
  );
}

const hasImportExtension = (name: string): boolean =>
  IMPORT_FILE_EXTENSIONS.some((ext) => name.toLowerCase().endsWith(ext));

/** `POST /imports` (multipart `file` + `kind`): the file is parsed now; the job has its headers. */
export async function UPLOAD_IMPORT(
  form: FormData,
): Promise<ApiResult<ImportJob>> {
  const file = form.get('file');
  const kind = UploadImportRequestSchema.safeParse({ kind: form.get('kind') });
  if (!(file instanceof File) || !kind.success) return invalid();
  if (!hasImportExtension(file.name))
    return {
      success: false,
      status: 400,
      error: 'FILE_TYPE',
      message: 'Unsupported file',
    };
  if (file.size > IMPORT_MAX_BYTES)
    return {
      success: false,
      status: 400,
      error: 'FILE_TOO_LARGE',
      message: 'File too large',
    };
  const body = new FormData();
  body.set('kind', kind.data.kind);
  body.set('file', file, file.name);
  return handleResponse(
    await apiFetch<ImportJob>('/imports', {
      method: 'POST',
      body,
      revalidateTags: [IMPORTS_TAG],
    }),
  );
}

/** `POST /imports/:id/preview`: check every row with this mapping; counts, sample, first issues. */
export async function PREVIEW_IMPORT(
  id: string,
  input: unknown,
): Promise<ApiResult<ImportPreview>> {
  const parsed = PreviewImportRequestSchema.safeParse(input);
  if (!IdSchema.safeParse(id).success || !parsed.success) return invalid();
  return handleResponse(
    await apiFetch<ImportPreview>(`/imports/${id}/preview`, {
      method: 'POST',
      body: parsed.data,
    }),
  );
}

/** `POST /imports/:id/confirm`: all rows or none, in one transaction. */
export async function CONFIRM_IMPORT(
  id: string,
): Promise<ApiResult<ImportJob>> {
  if (!IdSchema.safeParse(id).success) return invalid();
  return handleResponse(
    await apiFetch<ImportJob>(`/imports/${id}/confirm`, {
      method: 'POST',
      revalidateTags: [IMPORTS_TAG, OWNERS_TAG],
    }),
  );
}

/** `GET /imports`: past jobs, newest first, only the kinds the caller may import. */
export async function GET_IMPORTS(
  query: unknown,
): Promise<ApiResult<ImportJob[]>> {
  const parsed = ImportListQuerySchema.safeParse(query);
  if (!parsed.success) return invalid();
  return handleResponse(
    await apiFetch<ImportJob[]>('/imports', {
      params: parsed.data,
      cache: 'no-store',
    }),
  );
}

/** How many `GET /imports` pages `GET_IMPORT` reads looking for one job. */
const IMPORT_LOOKUP_PAGES = 10;

/**
 * One job. The contract has no `GET /imports/:id`, so this reads the list (newest first) until it
 * finds it; an older job than the lookup reaches answers 404.
 */
export async function GET_IMPORT(id: string): Promise<ApiResult<ImportJob>> {
  if (!IdSchema.safeParse(id).success) return invalid();
  for (let page = 1; page <= IMPORT_LOOKUP_PAGES; page++) {
    const res = await apiFetch<ImportJob[]>('/imports', {
      params: { page, limit: PAGE_LIMIT_MAX },
      cache: 'no-store',
    });
    if (!res.success) return handleResponse(res);
    const job = res.data.find((item) => item.id === id);
    if (job) return { success: true, status: 200, data: job };
    if (!res.meta?.hasNextPage) break;
  }
  return {
    success: false,
    status: 404,
    error: 'NOT_FOUND',
    message: 'Not found',
  };
}

/** `GET /imports/:id/issues`: the rows an import won't (or didn't) add, filtered by reason. */
export async function GET_IMPORT_ISSUES(
  id: string,
  query: unknown,
): Promise<ApiResult<ImportIssue[]>> {
  const parsed = ImportIssuesQuerySchema.safeParse(query);
  if (!IdSchema.safeParse(id).success || !parsed.success) return invalid();
  return handleResponse(
    await apiFetch<ImportIssue[]>(`/imports/${id}/issues`, {
      params: parsed.data,
      cache: 'no-store',
    }),
  );
}
// ====== owners-admin + imports (T15) — end
