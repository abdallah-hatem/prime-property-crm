'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useSession } from '@/components/session-provider';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { useTranslation } from '@/i18n/i18n-provider';
import {
  ADMIN_ROUTES,
  MAIN_ROUTES,
  MORE_ROUTE,
  adminRoutesFor,
  isActiveRoute,
  type NavRoute,
} from '@/lib/routes';
import { cn } from '@/lib/utils';
import { AccountPanel } from './account-panel';
import { NAV_ICONS } from './nav-icons';
import { UserAvatar } from './user-avatar';
import { UserText } from '@/components/user-text';

/**
 * The signed-in frame: a floating sidebar from md up, and on phones a slim top bar with the
 * account button plus the frosted pill tab bar (Today, Owners, Listings, More). Menus are built
 * from the user's permissions, which the server already knows at first paint.
 */
export function AppShell({ children }: { children: React.ReactNode }) {
  const { t } = useTranslation();

  return (
    <div
      data-testid="app-shell"
      className="min-h-dvh md:grid md:grid-cols-[16rem_minmax(0,1fr)]"
    >
      <a
        href="#main"
        className="sr-only z-50 rounded-pill bg-card px-4 py-2 shadow-raised focus:not-sr-only focus:fixed focus:start-4 focus:top-4"
      >
        {t('app.skipToContent')}
      </a>
      <Sidebar />
      <div className="flex min-w-0 flex-col">
        <PhoneTopBar />
        <main
          id="main"
          className="mx-auto w-full max-w-5xl px-safe-4 pt-2 pb-[calc(6.5rem+max(0.25rem,calc(env(safe-area-inset-bottom)-0.5rem)))] md:px-8 md:pt-8 md:pb-12 short:pb-[calc(4.5rem+max(0.25rem,calc(env(safe-area-inset-bottom)-0.5rem)))]"
        >
          {children}
        </main>
      </div>
      <BottomNav />
    </div>
  );
}

function Brand() {
  const { t } = useTranslation();
  return (
    <span className="flex items-center gap-2.5">
      <span
        aria-hidden
        className="grid size-9 place-items-center rounded-sm bg-primary-gradient font-numeric text-base font-extrabold text-primary-foreground shadow-glow"
      >
        P
      </span>
      <span className="text-base font-extrabold tracking-tight">
        {t('app.name')}
      </span>
    </span>
  );
}

function AccountMenu({ variant }: { variant: 'avatar' | 'row' }) {
  const me = useSession();
  const { t } = useTranslation();
  if (!me) return null;

  return (
    <Popover>
      <PopoverTrigger
        aria-label={t('account.menu')}
        data-testid="account-menu"
        className={cn(
          'cursor-pointer outline-none focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-ring',
          variant === 'avatar'
            ? 'rounded-pill transition-transform duration-150 ease-snappy active:scale-[0.97] motion-reduce:active:scale-100'
            : 'flex w-full min-w-0 items-center gap-3 rounded-md p-2 text-start transition-colors duration-150 hover:bg-accent active:bg-accent',
        )}
      >
        <UserAvatar name={me.name} />
        {variant === 'row' && (
          <span className="grid min-w-0">
            <span className="truncate text-sm font-bold">
              <UserText>{me.name}</UserText>
            </span>
            <span className="truncate text-xs text-muted-foreground">
              {me.role.name}
            </span>
          </span>
        )}
      </PopoverTrigger>
      <PopoverContent
        className="w-80"
        side={variant === 'row' ? 'top' : 'bottom'}
        align={variant === 'row' ? 'start' : 'end'}
      >
        <AccountPanel />
      </PopoverContent>
    </Popover>
  );
}

function SidebarLink({ route, active }: { route: NavRoute; active: boolean }) {
  const { t } = useTranslation();
  const Icon = NAV_ICONS[route.icon];
  return (
    <Link
      href={route.href}
      aria-current={active ? 'page' : undefined}
      className={cn(
        'flex h-11 items-center gap-3 rounded-pill px-4 text-sm font-semibold transition-colors duration-150',
        active
          ? 'bg-primary text-primary-foreground shadow-glow'
          : 'text-muted-foreground hover:bg-accent hover:text-accent-foreground active:bg-accent active:text-accent-foreground',
      )}
    >
      <Icon aria-hidden className="size-[18px] shrink-0" />
      <span className="truncate">{t(`nav.${route.labelKey}`)}</span>
    </Link>
  );
}

function Sidebar() {
  const me = useSession();
  const pathname = usePathname();
  const { t } = useTranslation();
  const admin = adminRoutesFor(me?.permissions ?? []);

  return (
    <aside className="sticky top-0 hidden h-dvh p-3 md:block">
      <div className="flex h-full flex-col gap-6 rounded-lg bg-card p-3 shadow-raised">
        <div className="px-2 pt-2">
          <Brand />
        </div>
        <nav
          aria-label={t('nav.mainNavigation')}
          className="-me-1.5 grid scrollbar-clean min-h-0 flex-1 content-start gap-6 overflow-y-auto overscroll-contain pe-1.5"
        >
          <ul className="grid gap-1">
            {MAIN_ROUTES.map((route) => (
              <li key={route.href}>
                <SidebarLink
                  route={route}
                  active={isActiveRoute(pathname, route.href)}
                />
              </li>
            ))}
          </ul>
          {admin.length > 0 && (
            <div className="grid gap-2">
              <p className="px-4 text-xs font-semibold text-muted-foreground">
                {t('nav.admin')}
              </p>
              <ul className="grid gap-1">
                {admin.map((route) => (
                  <li key={route.href}>
                    <SidebarLink
                      route={route}
                      active={isActiveRoute(pathname, route.href)}
                    />
                  </li>
                ))}
              </ul>
            </div>
          )}
        </nav>
        <AccountMenu variant="row" />
      </div>
    </aside>
  );
}

function PhoneTopBar() {
  return (
    <div className="flex items-center justify-between px-safe-4 pt-[calc(0.75rem+env(safe-area-inset-top))] pb-2 md:hidden">
      <Brand />
      <AccountMenu variant="avatar" />
    </div>
  );
}

/** "More" stays lit on the More page and on every admin page it links to. */
const isMoreActive = (pathname: string): boolean =>
  isActiveRoute(pathname, MORE_ROUTE.href) ||
  ADMIN_ROUTES.some((route) => isActiveRoute(pathname, route.href));

function BottomNav() {
  const pathname = usePathname();
  const { t } = useTranslation();
  const tabs = [...MAIN_ROUTES, MORE_ROUTE];

  return (
    <nav
      aria-label={t('nav.mainNavigation')}
      className="fixed inset-x-[max(0.875rem,env(safe-area-inset-left),env(safe-area-inset-right))] bottom-[max(0.25rem,calc(env(safe-area-inset-bottom)-0.5rem))] z-40 md:hidden short:bottom-[max(0.25rem,calc(env(safe-area-inset-bottom)-0.5rem))]"
    >
      <ul className="grid grid-cols-4 gap-0.5 rounded-pill border border-border bg-card/80 p-1 shadow-raised backdrop-blur-lg">
        {tabs.map((route) => {
          const active =
            route === MORE_ROUTE
              ? isMoreActive(pathname)
              : isActiveRoute(pathname, route.href);
          const Icon = NAV_ICONS[route.icon];
          const label = t(`nav.${route.labelKey}`);
          return (
            <li key={route.href}>
              <Link
                href={route.href}
                aria-current={active ? 'page' : undefined}
                className={cn(
                  // Icon over label on every tab: four equal columns fit "Listings" / "الوحدات"
                  // at 320 px. On a short viewport (landscape, 200% zoom) the labels hide and
                  // the bar slims down so it covers less of the page.
                  'flex h-14 min-w-0 flex-col items-center justify-center gap-0.5 rounded-pill px-1 text-[11px] leading-tight font-bold transition-colors duration-200 ease-snappy short:h-11',
                  active
                    ? 'bg-primary text-primary-foreground'
                    : 'text-muted-foreground hover:text-foreground active:bg-accent active:text-accent-foreground',
                )}
              >
                <Icon aria-hidden className="size-5 shrink-0" />
                <span className="max-w-full truncate short:sr-only">
                  {label}
                </span>
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
