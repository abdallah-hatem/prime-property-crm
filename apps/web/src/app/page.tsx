import { redirect } from 'next/navigation';
import { homeFor, LOGIN_PATH } from '@/lib/routes';
import { getSession } from '@/lib/session';

/** `/` has no screen of its own: the proxy sends everyone on; this is the fallback. */
export default async function RootPage() {
  const session = await getSession();
  redirect(
    session.status === 'signedIn'
      ? homeFor(session.me.permissions)
      : LOGIN_PATH,
  );
}
