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
