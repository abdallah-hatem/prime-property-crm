// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { BinaryFile } from './api';

/**
 * `apiFetch` with `response: 'binary'` (exports): the file comes back base64-encoded with its type
 * and name, a refusal still reads the API's error code, and an expired access token is refreshed
 * and the download retried once, exactly like a JSON call from a server action.
 */

const jar = vi.hoisted(() => new Map<string, string>());
const refreshSession = vi.hoisted(() => vi.fn());

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
  // Called from a server action: cookies are writable, a 401 refreshes inline.
  headers: async () => new Headers({ 'next-action': 'abc' }),
}));
vi.mock('./session-tokens', async (original) => ({
  ...(await original<typeof import('./session-tokens')>()),
  refreshSession,
}));

const { apiFetch } = await import('./api');
const { ACCESS_COOKIE, REFRESH_COOKIE } = await import('./session-tokens');

const BYTES = new Uint8Array([0x50, 0x4b, 0x03, 0x04, 0xff, 0x00]);
const XLSX =
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

const fileAnswer = () =>
  new Response(BYTES, {
    status: 200,
    headers: {
      'content-type': XLSX,
      'content-disposition': `attachment; filename="owners.xlsx"; filename*=UTF-8''${encodeURIComponent('الملاك.xlsx')}`,
    },
  });
const jsonAnswer = (status: number, body: object) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });

const fetchMock = vi.fn<typeof fetch>();

beforeEach(() => {
  jar.clear();
  refreshSession.mockReset();
  fetchMock.mockReset();
  vi.stubGlobal('fetch', fetchMock);
  vi.stubEnv('API_URL', 'http://api.test/api');
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe('apiFetch binary mode', () => {
  it('returns the bytes base64-encoded with the type and the (UTF-8) file name', async () => {
    jar.set(ACCESS_COOKIE, 'at-1');
    fetchMock.mockResolvedValue(fileAnswer());

    const res = await apiFetch<BinaryFile>('/exports/owners', {
      response: 'binary',
    });

    expect(res.success).toBe(true);
    if (!res.success) return;
    expect(Buffer.from(res.data.base64, 'base64')).toEqual(Buffer.from(BYTES));
    expect(res.data).toMatchObject({
      contentType: XLSX,
      fileName: 'الملاك.xlsx',
    });
    const init = fetchMock.mock.calls[0]![1]!;
    expect(new Headers(init.headers).get('Authorization')).toBe('Bearer at-1');
  });

  it('a refusal reads the error envelope', async () => {
    jar.set(ACCESS_COOKIE, 'at-1');
    fetchMock.mockResolvedValue(
      jsonAnswer(400, {
        success: false,
        error: 'EXPORT_TOO_LARGE',
        message: 'Too many rows',
      }),
    );
    const res = await apiFetch<BinaryFile>('/exports/owners', {
      response: 'binary',
    });
    expect(res).toMatchObject({
      success: false,
      status: 400,
      error: 'EXPORT_TOO_LARGE',
    });
  });

  it('an expired token is refreshed in place and the download retried once', async () => {
    jar.set(ACCESS_COOKIE, 'at-old');
    jar.set(REFRESH_COOKIE, 'rt-old');
    refreshSession.mockResolvedValue({
      kind: 'ok',
      pair: { accessToken: 'at-new', refreshToken: 'rt-new' },
    });
    fetchMock
      .mockResolvedValueOnce(
        jsonAnswer(401, { success: false, error: 'UNAUTHORIZED' }),
      )
      .mockResolvedValueOnce(fileAnswer());

    const res = await apiFetch<BinaryFile>('/exports/owners', {
      response: 'binary',
    });

    expect(refreshSession).toHaveBeenCalledWith('rt-old');
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(
      new Headers(fetchMock.mock.calls[1]![1]!.headers).get('Authorization'),
    ).toBe('Bearer at-new');
    expect(res.success).toBe(true);
    if (res.success) expect(res.data.fileName).toBe('الملاك.xlsx');
    expect(jar.get(ACCESS_COOKIE)).toBe('at-new');
  });

  it('a failed refresh ends the session and reports unauthorized', async () => {
    jar.set(ACCESS_COOKIE, 'at-old');
    jar.set(REFRESH_COOKIE, 'rt-old');
    refreshSession.mockResolvedValue({ kind: 'invalid' });
    fetchMock.mockResolvedValue(
      jsonAnswer(401, { success: false, error: 'UNAUTHORIZED' }),
    );
    const res = await apiFetch<BinaryFile>('/exports/owners', {
      response: 'binary',
    });
    expect(res).toMatchObject({ success: false, unauthorized: true });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(jar.has(ACCESS_COOKIE)).toBe(false);
  });
});
