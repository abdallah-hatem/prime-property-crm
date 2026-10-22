// @vitest-environment node
import { NextRequest } from 'next/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { REFRESH_GRACE_SECONDS } from '@prime-crm/shared';
import { authProxy } from './auth-proxy';
import { homeFor } from './routes';
import {
  ACCESS_COOKIE,
  REFRESH_COOKIE,
  resetRefreshCache,
} from './session-tokens';

/**
 * The T12 auth-routing cases, one test each, against the real proxy with the API's refresh
 * endpoint faked by a stand-in that rotates tokens with the same 30 s grace window as the API.
 */

const NOW = Date.UTC(2026, 9, 22, 10, 0, 0);
const ORIGIN = 'http://localhost:3123';
const ALL_ADMIN = [
  'users.manage',
  'roles.manage',
  'owners.import',
  'analytics.view',
];

const b64url = (value: object) =>
  Buffer.from(JSON.stringify(value)).toString('base64url');
/** An access JWT shape (unsigned; the proxy never verifies, the API does). */
const accessToken = (
  expInSeconds: number,
  permissions: string[] = [],
  sub = 'user-1',
) =>
  `${b64url({ alg: 'HS256', typ: 'JWT' })}.${b64url({
    sub,
    permissions,
    exp: Math.floor(NOW / 1000) + expInSeconds,
  })}.signature`;

function request(
  path: string,
  cookies: Record<string, string> = {},
  headers: HeadersInit = {},
) {
  const cookie = Object.entries(cookies)
    .map(([name, value]) => `${name}=${value}`)
    .join('; ');
  return new NextRequest(new URL(path, ORIGIN), {
    headers: {
      ...(cookie ? { cookie } : {}),
      ...Object.fromEntries(new Headers(headers)),
    },
  });
}

const location = (res: Response) => {
  const value = res.headers.get('location');
  return value ? value.replace(ORIGIN, '') : null;
};
const setCookies = (res: Response) => res.headers.getSetCookie();
const cookieValue = (res: Response, name: string) =>
  setCookies(res)
    .find((c) => c.startsWith(`${name}=`))
    ?.split(';')[0]
    ?.slice(name.length + 1);

/** The API's refresh rules: first use rotates; reuse inside the grace window gets a pair too. */
function fakeRefreshApi(valid: Set<string>) {
  const usedAt = new Map<string, number>();
  let issued = 0;
  return vi.fn(async (_url: string, init: RequestInit) => {
    const { refreshToken } = JSON.parse(String(init.body)) as {
      refreshToken: string;
    };
    const used = usedAt.get(refreshToken);
    const ok =
      valid.has(refreshToken) &&
      (used === undefined || NOW - used <= REFRESH_GRACE_SECONDS * 1000);
    if (!ok)
      return Response.json(
        {
          success: false,
          statusCode: 401,
          error: 'INVALID_REFRESH',
          message: 'Invalid',
        },
        { status: 401 },
      );
    usedAt.set(refreshToken, used ?? NOW);
    issued += 1;
    const pair = {
      accessToken: accessToken(15 * 60),
      refreshToken: `rt-${issued}`,
    };
    valid.add(pair.refreshToken);
    return Response.json({ success: true, statusCode: 200, data: pair });
  });
}

beforeEach(() => {
  process.env.API_URL = 'http://api.test/api';
  resetRefreshCache();
});
afterEach(() => {
  vi.unstubAllGlobals();
});

describe('auth routing (proxy)', () => {
  it('Signed out on a protected page → login with return path', async () => {
    const res = await authProxy(request('/owners?page=2'), NOW);
    expect(res.status).toBe(307);
    expect(location(res)).toBe('/login?next=%2Fowners%3Fpage%3D2');
  });

  it('Signed in on /login → homeFor(role)', async () => {
    const member = await authProxy(
      request('/login', {
        [ACCESS_COOKIE]: accessToken(600),
        [REFRESH_COOKIE]: 'rt-0',
      }),
      NOW,
    );
    expect(location(member)).toBe(homeFor([]));

    const admin = await authProxy(
      request('/login?next=%2Fusers', {
        [ACCESS_COOKIE]: accessToken(600, ALL_ADMIN),
      }),
      NOW,
    );
    expect(location(admin)).toBe(homeFor(ALL_ADMIN));
  });

  it('Expired access + valid refresh → refreshed in place in middleware, no redirect', async () => {
    const api = fakeRefreshApi(new Set(['rt-0']));
    vi.stubGlobal('fetch', api);

    const res = await authProxy(
      request('/listings', {
        [ACCESS_COOKIE]: accessToken(-5),
        [REFRESH_COOKIE]: 'rt-0',
      }),
      NOW,
    );

    expect(location(res)).toBeNull();
    expect(res.headers.get('x-middleware-next')).toBe('1');
    expect(api).toHaveBeenCalledTimes(1);
    expect(api.mock.calls[0]?.[0]).toBe('http://api.test/api/auth/refresh');
    // Both cookies on this response…
    const newAccess = cookieValue(res, ACCESS_COOKIE);
    expect(newAccess).toBeTruthy();
    expect(cookieValue(res, REFRESH_COOKIE)).toBe('rt-1');
    expect(setCookies(res).every((c) => /HttpOnly/i.test(c))).toBe(true);
    // …and the new access token forwarded to this same request, so the page renders signed in.
    expect(res.headers.get('x-middleware-request-cookie')).toContain(
      `${ACCESS_COOKIE}=${newAccess}`,
    );
  });

  it('Three parallel requests refreshing with the same token → none signed out', async () => {
    const api = fakeRefreshApi(new Set(['rt-0']));
    vi.stubGlobal('fetch', api);
    const cookies = {
      [ACCESS_COOKIE]: accessToken(-5),
      [REFRESH_COOKIE]: 'rt-0',
    };

    // A page load and two prefetches on this server instance…
    const sameInstance = await Promise.all([
      authProxy(request('/today', cookies), NOW),
      authProxy(
        request('/owners', cookies, { 'next-router-prefetch': '1' }),
        NOW,
      ),
      authProxy(
        request('/listings', cookies, { 'next-router-prefetch': '1' }),
        NOW,
      ),
    ]);
    // …and the same token arriving at another instance, inside the API's grace window.
    resetRefreshCache();
    const otherInstance = await authProxy(request('/today', cookies), NOW);

    for (const res of [...sameInstance, otherInstance]) {
      expect(location(res)).toBeNull();
      expect(cookieValue(res, ACCESS_COOKIE)).toBeTruthy();
      expect(cookieValue(res, REFRESH_COOKIE)).toMatch(/^rt-\d+$/);
    }
  });

  it('Failed refresh → login, cookies cleared', async () => {
    vi.stubGlobal('fetch', fakeRefreshApi(new Set()));

    const res = await authProxy(
      request('/today', {
        [ACCESS_COOKIE]: accessToken(-5),
        [REFRESH_COOKIE]: 'revoked',
      }),
      NOW,
    );

    expect(location(res)).toBe('/login?next=%2Ftoday');
    for (const name of [ACCESS_COOKIE, REFRESH_COOKIE]) {
      const cleared = setCookies(res).find((c) => c.startsWith(`${name}=`));
      expect(cleared).toMatch(/Expires=Thu, 01 Jan 1970|Max-Age=0/i);
    }
  });

  it('A member opening an admin page → their home', async () => {
    const member = { [ACCESS_COOKIE]: accessToken(600, []) };
    for (const path of [
      '/users',
      '/roles',
      '/imports',
      '/analytics',
      '/trash',
      '/activity',
      '/settings',
    ]) {
      const res = await authProxy(request(path, member), NOW);
      expect(location(res)).toBe(homeFor([]));
    }
    // The permission, not the role name, opens the page.
    const admin = await authProxy(
      request('/users', { [ACCESS_COOKIE]: accessToken(600, ALL_ADMIN) }),
      NOW,
    );
    expect(location(admin)).toBeNull();
  });

  it('keeps the session when the API is unreachable during a refresh', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() => Promise.reject(new Error('fetch failed'))),
    );
    const res = await authProxy(
      request('/today', {
        [ACCESS_COOKIE]: accessToken(-5),
        [REFRESH_COOKIE]: 'rt-0',
      }),
      NOW,
    );
    expect(location(res)).toBeNull();
    expect(setCookies(res)).toHaveLength(0);
  });

  it('lets server actions through without redirecting', async () => {
    const res = await authProxy(
      request('/today', {}, { 'next-action': 'abc' }),
      NOW,
    );
    expect(location(res)).toBeNull();
  });
});
