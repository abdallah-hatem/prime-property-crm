import 'server-only';
import { cache } from 'react';
import { cookies } from 'next/headers';
import type { Me } from '@prime-crm/shared';
import { GET_ME } from '@/apis';
import { ACCESS_COOKIE } from './session-tokens';

export type SessionState =
  | { status: 'signedOut' }
  | { status: 'signedIn'; me: Me }
  /** Signed in, but the API couldn't be reached: the shell shows the error, not the login page. */
  | { status: 'unavailable' };

/**
 * Who is signed in, read on the server once per request (the root layout and any page share it).
 * The proxy has already refreshed an expiring token, so the cookie here is fresh; a 401 from
 * `/auth/me` sends the request through sign-out inside `apiFetch`.
 */
export const getSession = cache(async (): Promise<SessionState> => {
  if (!(await cookies()).has(ACCESS_COOKIE)) return { status: 'signedOut' };
  const res = await GET_ME();
  if (res.success) return { status: 'signedIn', me: res.data };
  return res.status === 0 || res.status >= 500
    ? { status: 'unavailable' }
    : { status: 'signedOut' };
});
