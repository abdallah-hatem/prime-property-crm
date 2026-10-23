'use server';

import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import {
  LOCALE_COOKIE,
  LanguageSchema,
  LoginRequestSchema,
  type Language,
  type LoginResponse,
  type Me,
} from '@prime-crm/shared';
import { apiFetch } from '@/lib/api';
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

// ============================================================== listings (T14) — begin
// Listings, the Property Finder ad, notes and photos (spec, "Listings — /listings" and "Photos").

import { z } from 'zod';
import {
  AdCheckInRequestSchema,
  AreaLookupQuerySchema,
  CreateListingRequestSchema,
  CreateNoteRequestSchema,
  ListingListQuerySchema,
  ListingPhotoUploadRequestSchema,
  ListingStatusRequestSchema,
  RegisterPhotoRequestSchema,
  ReorderPhotosRequestSchema,
  UpdateAdRequestSchema,
  UpdateListingRequestSchema,
  type AreaOption,
  type Listing,
  type ListingRow,
  type Note,
  type Owner,
  type Photo,
} from '@prime-crm/shared';
import { apiBaseUrl } from '@/lib/env';

const IdSchema = z.uuid();
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
