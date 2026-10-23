// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { LOCALE_COOKIE, type LoginResponse } from '@prime-crm/shared';
import type { ApiFetchOptions } from './api';

/**
 * Sign-in (the LOGIN server action) and the account's language: signing in from a page in
 * another language saves that language on the account; a first sign-in on a device adopts the
 * account's. The API transport and the cookie jar are faked.
 */

const jar = vi.hoisted(() => new Map<string, string>());
const apiFetch = vi.hoisted(() => vi.fn());

vi.mock('server-only', () => ({}));
vi.mock('next/cache', () => ({ revalidateTag: vi.fn() }));
vi.mock('next/navigation', () => ({ redirect: vi.fn() }));
vi.mock('next/headers', () => ({
  cookies: async () => ({
    get: (name: string) =>
      jar.has(name) ? { name, value: jar.get(name) } : undefined,
    has: (name: string) => jar.has(name),
    set: (name: string, value: string) => void jar.set(name, value),
    delete: (name: string) => void jar.delete(name),
  }),
  headers: async () => new Headers(),
}));
vi.mock('@/lib/api', () => ({ apiFetch }));

const { LOGIN } = await import('@/apis');

const ACCESS = 'access-token-from-sign-in';

function loginAnswer(language: 'en' | 'ar'): LoginResponse {
  return {
    accessToken: ACCESS,
    refreshToken: 'refresh-token',
    user: {
      id: '11111111-1111-4111-8111-111111111111',
      name: 'Sara Mahmoud',
      email: 'sara@prime.test',
      phone: null,
      language,
      role: { id: '22222222-2222-4222-8222-222222222222', name: 'Team member' },
      permissions: [],
    },
  } as unknown as LoginResponse;
}

const CREDENTIALS = { email: 'sara@prime.test', password: 'a-password-1' };

function answerLoginWith(language: 'en' | 'ar') {
  apiFetch.mockImplementation(async (path: string) =>
    path === '/auth/login'
      ? { success: true, status: 200, data: loginAnswer(language) }
      : { success: true, status: 200, data: {} },
  );
}

const languageCalls = () =>
  apiFetch.mock.calls.filter(([path]) => path === '/auth/me') as [
    string,
    ApiFetchOptions,
  ][];

beforeEach(() => {
  jar.clear();
  apiFetch.mockReset();
});

describe('LOGIN and the account language', () => {
  it('signing in from the Arabic page saves ar on an English account, with the new token', async () => {
    jar.set(LOCALE_COOKIE, 'ar');
    answerLoginWith('en');

    const res = await LOGIN(CREDENTIALS, null);

    expect(res.success).toBe(true);
    const calls = languageCalls();
    expect(calls).toHaveLength(1);
    const [, options] = calls[0]!;
    expect(options).toMatchObject({
      method: 'PATCH',
      body: { language: 'ar' },
      includeAuth: false,
    });
    expect(new Headers(options.headers).get('Authorization')).toBe(
      `Bearer ${ACCESS}`,
    );
    expect(jar.get(LOCALE_COOKIE)).toBe('ar');
  });

  it('saves nothing when the page and the account agree', async () => {
    jar.set(LOCALE_COOKIE, 'ar');
    answerLoginWith('ar');
    await LOGIN(CREDENTIALS, null);
    expect(languageCalls()).toHaveLength(0);
  });

  it('a first sign-in on this device (no language chosen) opens in the account language', async () => {
    answerLoginWith('ar');
    await LOGIN(CREDENTIALS, null);
    expect(languageCalls()).toHaveLength(0);
    expect(jar.get(LOCALE_COOKIE)).toBe('ar');
  });

  it('still signs in when saving the language fails', async () => {
    jar.set(LOCALE_COOKIE, 'ar');
    apiFetch.mockImplementation(async (path: string) =>
      path === '/auth/login'
        ? { success: true, status: 200, data: loginAnswer('en') }
        : { success: false, status: 500, message: 'down' },
    );
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    const res = await LOGIN(CREDENTIALS, null);
    expect(res).toMatchObject({
      success: true,
      data: { redirectTo: '/today' },
    });
  });
});
