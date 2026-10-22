import { NextResponse, type NextRequest } from 'next/server';
import { canOpen, homeFor, isGuestOnly, isPublic, loginUrlFor } from './routes';
import {
  ACCESS_COOKIE,
  REFRESH_COOKIE,
  isAccessFresh,
  readAccessClaims,
  refreshSession,
  sessionCookies,
  type AccessClaims,
  type SessionCookie,
} from './session-tokens';

/** Header the proxy adds so server code knows the page being rendered (apiFetch's 401 hand-off). */
export const PATHNAME_HEADER = 'x-pathname';

type SessionChange =
  | { kind: 'none' }
  | { kind: 'rotated'; cookies: SessionCookie[] }
  | { kind: 'cleared' };

/**
 * Auth routing, on the first request, before anything renders:
 * - a fresh access token → continue;
 * - expired / missing access with a refresh token → refresh IN PLACE: the new access token is
 *   written into this request's Cookie header (so the page renders signed in) and both cookies
 *   are set on this response. The browser is never bounced to a refresh URL;
 * - a refused refresh → cookies cleared, treated as signed out;
 * - then: signed out on a protected page → login with the return path; signed in on login →
 *   their home; a page their permissions don't cover → their home.
 * Server actions (POSTs with `next-action`) get the refresh but no redirect: the action answers
 * 401 itself and the client sends the user to login.
 */
export async function authProxy(
  request: NextRequest,
  now = Date.now(),
): Promise<NextResponse> {
  const { pathname, search } = request.nextUrl;
  const isServerAction = request.headers.has('next-action');

  let claims: AccessClaims | null = readAccessClaims(
    request.cookies.get(ACCESS_COOKIE)?.value,
  );
  let change: SessionChange = { kind: 'none' };

  if (!isAccessFresh(claims, now)) {
    const refreshToken = request.cookies.get(REFRESH_COOKIE)?.value;
    const result = refreshToken
      ? await refreshSession(refreshToken)
      : ({ kind: 'invalid' } as const);
    if (result.kind === 'ok') {
      claims = readAccessClaims(result.pair.accessToken);
      change = { kind: 'rotated', cookies: sessionCookies(result.pair) };
    } else if (result.kind === 'invalid') {
      claims = null;
      if (
        request.cookies.has(ACCESS_COOKIE) ||
        request.cookies.has(REFRESH_COOKIE)
      )
        change = { kind: 'cleared' };
    }
    // 'unavailable': the API is down. Keep the cookies; the page shows the network error and the
    // next request tries again. A stale access token still counts as signed in for routing.
  }

  const destination = isServerAction
    ? null
    : routeFor(pathname, search, claims);
  const response = destination
    ? NextResponse.redirect(new URL(destination, request.url))
    : NextResponse.next({
        request: { headers: forwardedHeaders(request, change) },
      });

  applyChange(response, change);
  return response;
}

/** Where this request should go instead, or `null` to render it. */
function routeFor(
  pathname: string,
  search: string,
  claims: AccessClaims | null,
): string | null {
  if (isPublic(pathname)) return null;
  if (isGuestOnly(pathname)) return claims ? homeFor(claims.permissions) : null;
  if (!claims) return loginUrlFor(`${pathname}${search}`);
  if (pathname === '/') return homeFor(claims.permissions);
  if (!canOpen(pathname, claims.permissions))
    return homeFor(claims.permissions);
  return null;
}

/** This request's headers with the session as it now is, so the render sees the new token. */
function forwardedHeaders(
  request: NextRequest,
  change: SessionChange,
): Headers {
  const headers = new Headers(request.headers);
  headers.set(PATHNAME_HEADER, request.nextUrl.pathname);
  if (change.kind === 'none') return headers;

  const jar = new Map(request.cookies.getAll().map((c) => [c.name, c.value]));
  if (change.kind === 'rotated')
    for (const c of change.cookies) jar.set(c.name, c.value);
  else {
    jar.delete(ACCESS_COOKIE);
    jar.delete(REFRESH_COOKIE);
  }
  headers.set(
    'cookie',
    [...jar]
      .map(([name, value]) => `${name}=${encodeURIComponent(value)}`)
      .join('; '),
  );
  return headers;
}

function applyChange(response: NextResponse, change: SessionChange): void {
  if (change.kind === 'rotated')
    for (const c of change.cookies)
      response.cookies.set(c.name, c.value, c.options);
  if (change.kind === 'cleared') {
    response.cookies.delete(ACCESS_COOKIE);
    response.cookies.delete(REFRESH_COOKIE);
  }
}
