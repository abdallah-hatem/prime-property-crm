import { NextResponse, type NextRequest } from 'next/server';
import { loginUrlFor } from '@/lib/routes';
import { ACCESS_COOKIE, REFRESH_COOKIE } from '@/lib/session-tokens';

/**
 * Where a render lands when the API answers 401 to a token the proxy thought was fine (the user
 * was deactivated, the session revoked): clear both cookies here, where they are writable, and go
 * to login keeping the page to return to. Without this the proxy would bounce a signed-in-looking
 * visitor from login back to the page, forever.
 */
export function GET(request: NextRequest) {
  const next = request.nextUrl.searchParams.get('next') ?? '/';
  const response = NextResponse.redirect(
    new URL(loginUrlFor(next), request.url),
  );
  response.cookies.delete(ACCESS_COOKIE);
  response.cookies.delete(REFRESH_COOKIE);
  return response;
}
