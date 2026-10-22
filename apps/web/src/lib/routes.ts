import type { Permission } from '@prime-crm/shared';

/**
 * Every route the shell knows, and who may open it. The proxy (auth routing), the sidebar, the
 * bottom bar and the More page all read this one table, so a page's permission is declared once.
 */

export const LOGIN_PATH = '/login';
/** Route handler that clears the session cookies and lands on login (used when a render gets 401). */
export const SIGN_OUT_PATH = '/api/auth/signout';

/**
 * The one place that decides where a signed-in person lands: after sign-in, on `/`, on `/login`,
 * and when they open a page their role can't use. Everyone starts on Today for now; the admin
 * dashboard (T17) changes only this function.
 */
// eslint-disable-next-line @typescript-eslint/no-unused-vars -- the signature every caller uses; T17 branches on it
export function homeFor(permissions: readonly string[]): string {
  return '/today';
}

export type NavIcon =
  | 'today'
  | 'owners'
  | 'listings'
  | 'more'
  | 'users'
  | 'roles'
  | 'imports'
  | 'analytics'
  | 'trash'
  | 'activity'
  | 'settings';

export interface NavRoute {
  href: string;
  /** Key under `nav.` in the locale files. */
  labelKey: NavIcon;
  icon: NavIcon;
  /** Needed to open the page; `undefined` = every signed-in user. */
  permission?: Permission;
}

/** The main tabs every signed-in user has (bottom bar on phones, top of the sidebar). */
export const MAIN_ROUTES: readonly NavRoute[] = [
  { href: '/today', labelKey: 'today', icon: 'today' },
  { href: '/owners', labelKey: 'owners', icon: 'owners' },
  { href: '/listings', labelKey: 'listings', icon: 'listings' },
];

/** Admin pages, each behind one permission. */
export const ADMIN_ROUTES: readonly NavRoute[] = [
  {
    href: '/users',
    labelKey: 'users',
    icon: 'users',
    permission: 'users.manage',
  },
  {
    href: '/roles',
    labelKey: 'roles',
    icon: 'roles',
    permission: 'roles.manage',
  },
  {
    href: '/imports',
    labelKey: 'imports',
    icon: 'imports',
    permission: 'owners.import',
  },
  {
    href: '/analytics',
    labelKey: 'analytics',
    icon: 'analytics',
    permission: 'analytics.view',
  },
  {
    href: '/trash',
    labelKey: 'trash',
    icon: 'trash',
    permission: 'trash.restore',
  },
  {
    href: '/activity',
    labelKey: 'activity',
    icon: 'activity',
    permission: 'activity.view',
  },
  {
    href: '/settings',
    labelKey: 'settings',
    icon: 'settings',
    permission: 'settings.manage',
  },
];

/** The phone-only "More" tab: admin links (by permission) and the account controls. */
export const MORE_ROUTE: NavRoute = {
  href: '/more',
  labelKey: 'more',
  icon: 'more',
};

/** Pages anyone may open, signed in or not. */
const PUBLIC_PREFIXES = ['/api/auth', '/design'];
/** Pages only for signed-out visitors; a signed-in person is sent to their home. */
const GUEST_ONLY = [LOGIN_PATH];

const matches = (pathname: string, base: string): boolean =>
  pathname === base || pathname.startsWith(`${base}/`);

export const isGuestOnly = (pathname: string): boolean =>
  GUEST_ONLY.some((base) => matches(pathname, base));

export const isPublic = (pathname: string): boolean =>
  PUBLIC_PREFIXES.some((base) => matches(pathname, base));

/** The permission a path needs, or `undefined` when any signed-in user may open it. */
export function permissionFor(pathname: string): Permission | undefined {
  return ADMIN_ROUTES.find((route) => matches(pathname, route.href))
    ?.permission;
}

export function canOpen(
  pathname: string,
  permissions: readonly string[],
): boolean {
  const needed = permissionFor(pathname);
  return !needed || permissions.includes(needed);
}

/** The admin routes this person may open, in menu order. */
export const adminRoutesFor = (permissions: readonly string[]): NavRoute[] =>
  ADMIN_ROUTES.filter(
    (route) => !route.permission || permissions.includes(route.permission),
  );

/** Whether a nav item is the current page (a section stays active on its sub-pages). */
export const isActiveRoute = (pathname: string, href: string): boolean =>
  matches(pathname, href);

/**
 * A `next` return path is only followed when it is a path on this site: starts with one `/`,
 * no scheme, no protocol-relative `//host`, no backslash tricks. Anything else → `null`.
 */
export function safeReturnPath(
  value: string | null | undefined,
): string | null {
  if (!value || !value.startsWith('/') || value.startsWith('//')) return null;
  if (value.includes('\\') || [...value].some((c) => c.charCodeAt(0) < 32))
    return null;
  if (isGuestOnly(value.split('?')[0] ?? '')) return null;
  return value;
}

/** `/login?next=<path>` for a signed-out visitor on `path`. */
export function loginUrlFor(pathWithSearch: string): string {
  const next = safeReturnPath(pathWithSearch);
  return next && next !== '/'
    ? `${LOGIN_PATH}?next=${encodeURIComponent(next)}`
    : LOGIN_PATH;
}
