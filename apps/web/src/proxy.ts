import type { NextRequest } from 'next/server';
import { authProxy } from '@/lib/auth-proxy';

/** Next 16's request proxy (formerly `middleware`): auth routing and in-place token refresh. */
export function proxy(request: NextRequest) {
  return authProxy(request);
}

export const config = {
  // Every page and server action; not static assets, image optimisation or files with an extension.
  matcher: ['/((?!_next/static|_next/image|favicon.ico|.*\\.[a-zA-Z0-9]+$).*)'],
};
