import { render } from '@testing-library/react';
import type { CallOutcome, Me, Role, User } from '@prime-crm/shared';
import { SessionProvider } from '@/components/session-provider';
import { I18nProvider } from '@/i18n/i18n-provider';

/** Test-only fixtures and a provider wrapper for the admin component tests. */
export const ADMIN_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
export const SARA_ID = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
export const ADMIN_ROLE_ID = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
export const MEMBER_ROLE_ID = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';

export const adminRole: Role = {
  id: ADMIN_ROLE_ID,
  name: 'Admin',
  builtIn: 'ADMIN',
  permissions: [
    'users.manage',
    'roles.manage',
    'owners.viewAll',
    'owners.import',
    'owners.assign',
    'listings.create',
    'listings.manageAll',
    'analytics.view',
    'activity.view',
    'data.export',
    'trash.restore',
    'settings.manage',
  ],
  userCount: 1,
};

export const memberRole: Role = {
  id: MEMBER_ROLE_ID,
  name: 'Team member',
  builtIn: 'TEAM_MEMBER',
  permissions: [],
  userCount: 2,
};

export function userFixture(overrides: Partial<User> = {}): User {
  return {
    id: SARA_ID,
    name: 'Sara Mahmoud',
    email: 'sara@prime.test',
    phone: null,
    language: 'ar',
    active: true,
    role: { id: MEMBER_ROLE_ID, name: 'Team member' },
    createdAt: '2026-10-01T10:00:00.000Z',
    ...overrides,
  };
}

export function outcomeFixture(
  overrides: Partial<CallOutcome> = {},
): CallOutcome {
  return {
    id: 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee',
    labelEn: 'Busy',
    labelAr: 'مشغول',
    setsStatus: 'CONTACTED',
    hidden: false,
    order: 1,
    inUse: false,
    ...overrides,
  };
}

export const adminMe = {
  id: ADMIN_ID,
  name: 'Admin',
  email: 'admin@prime.test',
  permissions: adminRole.permissions,
} as unknown as Me;

export function renderAdmin(
  ui: React.ReactNode,
  { locale = 'en' }: { locale?: 'en' | 'ar' } = {},
) {
  document.documentElement.lang = locale;
  document.documentElement.dir = locale === 'ar' ? 'rtl' : 'ltr';
  return render(
    <SessionProvider me={adminMe}>
      <I18nProvider locale={locale}>{ui}</I18nProvider>
    </SessionProvider>,
  );
}
