'use server';

import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { z } from 'zod';
import {
  CreateNoteRequestSchema,
  CreateReminderRequestSchema,
  LOCALE_COOKIE,
  LanguageSchema,
  LoginRequestSchema,
  OwnerListQuerySchema,
  PAGE_LIMIT_MAX,
  ReminderKindSchema,
  ReminderStateSchema,
  ReminderWhenSchema,
  SetCallOutcomeRequestSchema,
  StartCallRequestSchema,
  UpdateOwnerRequestSchema,
  UpdateReminderRequestSchema,
  type Call,
  type CallOutcome,
  type Language,
  type LoginResponse,
  type Me,
  type Note,
  type Owner,
  type OwnerListQuery,
  type OwnerRow,
  type OwnerTimelineItem,
  type Reminder,
  type Today,
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
