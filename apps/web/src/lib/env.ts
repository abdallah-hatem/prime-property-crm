/**
 * Where the API lives (`apps/api`, base path `/api`). Read on the server only: the browser never
 * talks to the API directly, it goes through server actions and the proxy.
 */
export function apiBaseUrl(): string {
  const url = process.env.API_URL ?? process.env.NEXT_PUBLIC_API_URL;
  if (!url)
    throw new Error(
      'Set API_URL (or NEXT_PUBLIC_API_URL) to the API base, e.g. http://localhost:4010/api',
    );
  return url.replace(/\/+$/, '');
}
