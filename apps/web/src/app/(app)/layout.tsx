import { redirect } from 'next/navigation';
import { AppShell } from '@/components/shell/app-shell';
import { ServerUnavailable } from '@/components/shell/server-unavailable';
import { LOGIN_PATH } from '@/lib/routes';
import { getSession } from '@/lib/session';

/** Every signed-in page. The proxy has already routed signed-out visitors to login. */
export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await getSession();
  if (session.status === 'signedOut') redirect(LOGIN_PATH);
  if (session.status === 'unavailable') return <ServerUnavailable />;
  return <AppShell>{children}</AppShell>;
}
