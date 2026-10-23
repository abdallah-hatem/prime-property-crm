import { render } from '@testing-library/react';
import type { Listing, Me } from '@prime-crm/shared';
import { SessionProvider } from '@/components/session-provider';
import { I18nProvider } from '@/i18n/i18n-provider';

/** Test-only helpers for the listing component tests. */
export const SARA_ID = '11111111-1111-4111-8111-111111111111';
export const OMAR_ID = '22222222-2222-4222-8222-222222222222';
export const LISTING_ID = '33333333-3333-4333-8333-333333333333';

export function member(id = SARA_ID, permissions: string[] = []): Me {
  return {
    id,
    name: id === SARA_ID ? 'Sara Adel' : 'Omar Nabil',
    email: 'member@prime.test',
    permissions,
  } as unknown as Me;
}

export function listingFixture(overrides: Partial<Listing> = {}): Listing {
  return {
    id: LISTING_ID,
    title: 'Apartment · 3 BR · New Cairo',
    purpose: 'SALE',
    type: 'APARTMENT',
    area: 'New Cairo',
    compound: 'Mivida',
    price: 8_500_000,
    sizeSqm: 185,
    bedrooms: 3,
    bathrooms: 3,
    floor: 2,
    status: 'AVAILABLE',
    coverPhotoUrl: null,
    adStatus: 'NOT_POSTED',
    assignedTo: { id: OMAR_ID, name: 'Omar Nabil' },
    checkInDue: false,
    address: null,
    furnishing: null,
    description: null,
    photos: [],
    ownerName: 'Nadia Fathy',
    ownerPhone: null,
    ownerPhoneHidden: true,
    ownerId: null,
    ad: {
      link: null,
      status: 'NOT_POSTED',
      postedAt: null,
      takenDownAt: null,
      lastCheckInAt: null,
      nextCheckInAt: null,
    },
    notes: [],
    createdAt: '2026-10-01T10:00:00.000Z',
    updatedAt: '2026-10-01T10:00:00.000Z',
    ...overrides,
  };
}

export function renderWith(
  ui: React.ReactNode,
  {
    me = member(),
    locale = 'en',
  }: { me?: Me | null; locale?: 'en' | 'ar' } = {},
) {
  document.documentElement.lang = locale;
  document.documentElement.dir = locale === 'ar' ? 'rtl' : 'ltr';
  return render(
    <SessionProvider me={me}>
      <I18nProvider locale={locale}>{ui}</I18nProvider>
    </SessionProvider>,
  );
}
