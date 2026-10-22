import {
  ACCESS_TOKEN_TTL_SECONDS,
  REFRESH_TOKEN_TTL_DAYS,
  TokenPairSchema,
  type TokenPair,
} from '@prime-crm/shared';
import { apiBaseUrl } from './env';

/**
 * The session lives in two httpOnly cookies the browser never reads: the 15-minute access JWT and
 * the 30-day rotating refresh token. Only the server (proxy, route handlers, server actions) sets
 * or reads them.
 */
export const ACCESS_COOKIE = 'prime_at';
export const REFRESH_COOKIE = 'prime_rt';

/** Refresh this long before the access token expires, so a page render never meets a dead one. */
export const ACCESS_REFRESH_SKEW_SECONDS = 60;

export interface SessionCookie {
  name: string;
  value: string;
  options: {
    httpOnly: true;
    secure: boolean;
    sameSite: 'lax';
    path: '/';
    maxAge: number;
  };
}

const baseOptions = () => ({
  httpOnly: true as const,
  secure: process.env.NODE_ENV === 'production',
  // lax, not strict: a link from WhatsApp or an email must open the app signed in.
  sameSite: 'lax' as const,
  path: '/' as const,
});

/** The two cookies for a token pair, ready for `cookies().set` or `response.cookies.set`. */
export function sessionCookies(pair: TokenPair): SessionCookie[] {
  return [
    {
      name: ACCESS_COOKIE,
      value: pair.accessToken,
      options: { ...baseOptions(), maxAge: ACCESS_TOKEN_TTL_SECONDS },
    },
    {
      name: REFRESH_COOKIE,
      value: pair.refreshToken,
      options: {
        ...baseOptions(),
        maxAge: REFRESH_TOKEN_TTL_DAYS * 24 * 60 * 60,
      },
    },
  ];
}

export interface AccessClaims {
  sub: string;
  exp: number;
  permissions: string[];
}

function decodeBase64Url(segment: string): string {
  const base64 = segment.replace(/-/g, '+').replace(/_/g, '/');
  const padded = base64 + '='.repeat((4 - (base64.length % 4)) % 4);
  return new TextDecoder().decode(
    Uint8Array.from(atob(padded), (c) => c.charCodeAt(0)),
  );
}

/**
 * The access token's claims, read without verifying the signature. They only steer routing
 * (which page to show, which menu to draw); the API verifies every token it receives, so a forged
 * claim changes what is drawn, never what is allowed.
 */
export function readAccessClaims(
  token: string | undefined,
): AccessClaims | null {
  if (!token) return null;
  const payload = token.split('.')[1];
  if (!payload) return null;
  try {
    const claims = JSON.parse(
      decodeBase64Url(payload),
    ) as Partial<AccessClaims>;
    if (typeof claims.sub !== 'string' || typeof claims.exp !== 'number')
      return null;
    return {
      sub: claims.sub,
      exp: claims.exp,
      permissions: Array.isArray(claims.permissions)
        ? claims.permissions.filter((p): p is string => typeof p === 'string')
        : [],
    };
  } catch {
    return null;
  }
}

export const isAccessFresh = (
  claims: AccessClaims | null,
  nowMs: number,
): claims is AccessClaims =>
  !!claims && claims.exp - ACCESS_REFRESH_SKEW_SECONDS > nowMs / 1000;

export type RefreshResult =
  | { kind: 'ok'; pair: TokenPair }
  /** The API refused the token (401 INVALID_REFRESH): the session is over. */
  | { kind: 'invalid' }
  /** The API couldn't be reached or failed: keep the cookies, the user isn't signed out. */
  | { kind: 'unavailable' };

/**
 * One refresh per token per server instance: a page load and its prefetches arrive together with
 * the same refresh token, and they share one API call. Requests that land on another instance
 * (or just after this one settled) still succeed: the API accepts a reused token for
 * REFRESH_GRACE_SECONDS and answers with a pair in the same family.
 */
const inFlight = new Map<string, Promise<RefreshResult>>();
/** Keep a settled result briefly (well inside the API's grace window) for stragglers. */
const SETTLED_TTL_MS = 5_000;

export function refreshSession(refreshToken: string): Promise<RefreshResult> {
  const pending = inFlight.get(refreshToken);
  if (pending) return pending;
  const request = callRefresh(refreshToken);
  inFlight.set(refreshToken, request);
  void request.finally(() => {
    setTimeout(() => inFlight.delete(refreshToken), SETTLED_TTL_MS).unref?.();
  });
  return request;
}

async function callRefresh(refreshToken: string): Promise<RefreshResult> {
  try {
    const res = await fetch(`${apiBaseUrl()}/auth/refresh`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify({ refreshToken }),
      cache: 'no-store',
    });
    if (res.status === 400 || res.status === 401) return { kind: 'invalid' };
    if (!res.ok) return { kind: 'unavailable' };
    const body = (await res.json()) as { data?: unknown };
    const parsed = TokenPairSchema.safeParse(body.data);
    return parsed.success
      ? { kind: 'ok', pair: parsed.data }
      : { kind: 'unavailable' };
  } catch {
    return { kind: 'unavailable' };
  }
}

/** Test hook: forget every in-flight and settled refresh. */
export function resetRefreshCache(): void {
  inFlight.clear();
}
