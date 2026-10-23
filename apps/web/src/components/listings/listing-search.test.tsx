import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ListingRow } from '@prime-crm/shared';
import { ListingSearch } from './listing-search';
import { LISTING_ID, renderWith } from './test-fixtures';

const push = vi.fn();
let search = new URLSearchParams('');
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push, refresh: vi.fn() }),
  usePathname: () => '/listings',
  useSearchParams: () => search,
}));
vi.mock('@/apis', () => ({
  LOOKUP_LISTING_AREAS: vi.fn(() =>
    Promise.resolve({ success: true, status: 200, data: [] }),
  ),
}));
vi.mock('sonner', () => ({ toast: { error: vi.fn(), success: vi.fn() } }));

const row: ListingRow = {
  id: LISTING_ID,
  title: 'Villa · 5 BR · Sheikh Zayed',
  purpose: 'SALE',
  type: 'VILLA',
  area: 'Sheikh Zayed',
  compound: 'Allegria',
  price: 32_000_000,
  sizeSqm: 420,
  bedrooms: 5,
  bathrooms: 5,
  floor: null,
  status: 'AVAILABLE',
  coverPhotoUrl: null,
  adStatus: 'LIVE',
  assignedTo: null,
  checkInDue: true,
};

const meta = {
  total: 1,
  page: 1,
  limit: 20,
  hasNextPage: false,
  hasPreviousPage: false,
};

/** The wide-screen side panel (jsdom draws it at every width). */
const panel = () => screen.getByRole('complementary', { name: 'Filters' });

beforeEach(() => {
  push.mockReset();
  search = new URLSearchParams('');
});

describe('Listing search', () => {
  it('keeps the filters in the URL and never scrolls when applying them', async () => {
    const user = userEvent.setup();
    renderWith(<ListingSearch rows={[row]} meta={meta} />);

    await user.click(within(panel()).getByRole('button', { name: 'For sale' }));
    await user.click(within(panel()).getByRole('button', { name: 'Villa' }));
    await user.click(
      within(panel()).getByRole('button', { name: 'Townhouse' }),
    );
    await user.click(
      within(
        within(panel()).getAllByRole('group', { name: 'Bedrooms' }).at(-1)!,
      ).getByRole('button', { name: '3+' }),
    );
    await user.click(within(panel()).getByTestId('apply-filters'));

    expect(push).toHaveBeenCalledTimes(1);
    const [url, options] = push.mock.calls[0] as [string, { scroll: boolean }];
    const params = new URLSearchParams(url.split('?')[1]);
    expect(url.startsWith('/listings?')).toBe(true);
    expect(params.get('purpose')).toBe('SALE');
    expect(params.get('type')).toBe('VILLA,TOWNHOUSE');
    expect(params.get('bedroomsMin')).toBe('3');
    expect(params.has('page')).toBe(false);
    expect(options).toEqual({ scroll: false });
  });

  it('reads the current filters back from the URL', () => {
    search = new URLSearchParams(
      'purpose=RENT&type=VILLA,DUPLEX&priceMax=5000000',
    );
    renderWith(<ListingSearch rows={[row]} meta={meta} />);

    expect(
      within(panel()).getByRole('button', { name: 'For rent' }),
    ).toHaveAttribute('aria-pressed', 'true');
    expect(
      within(panel()).getByRole('button', { name: 'Duplex' }),
    ).toHaveAttribute('aria-pressed', 'true');
    expect(
      within(panel()).getByRole('textbox', { name: 'Price (EGP) — Maximum' }),
    ).toHaveValue('5,000,000');
  });

  it('blocks a minimum above its maximum', async () => {
    const user = userEvent.setup();
    renderWith(<ListingSearch rows={[row]} meta={meta} />);

    await user.type(
      within(panel()).getByRole('textbox', { name: 'Price (EGP) — Minimum' }),
      '5000000',
    );
    await user.type(
      within(panel()).getByRole('textbox', { name: 'Price (EGP) — Maximum' }),
      '1000000',
    );

    expect(within(panel()).getByRole('alert')).toHaveTextContent(
      'The minimum is above the maximum.',
    );
    const apply = within(panel()).getByTestId('apply-filters');
    expect(apply).toBeDisabled();
    await user.click(apply);
    expect(push).not.toHaveBeenCalled();
  });

  it('searches as you type, without scrolling', async () => {
    const user = userEvent.setup();
    renderWith(<ListingSearch rows={[row]} meta={meta} />);

    await user.type(screen.getByTestId('listing-search'), 'Mivida');
    await vi.waitFor(() => expect(push).toHaveBeenCalled(), { timeout: 2000 });
    expect(push).toHaveBeenLastCalledWith('/listings?q=Mivida', {
      scroll: false,
    });
  });

  it('shows the check-in due flag and the empty state', () => {
    const { unmount } = renderWith(<ListingSearch rows={[row]} meta={meta} />);
    expect(screen.getAllByTestId('check-in-due').length).toBeGreaterThan(0);
    unmount();

    renderWith(<ListingSearch rows={[]} meta={{ ...meta, total: 0 }} />, {
      locale: 'ar',
    });
    expect(screen.getByText('لا توجد وحدات مطابقة')).toBeInTheDocument();
  });
});
