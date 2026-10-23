import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ListingForm } from './listing-form';
import { listingFixture, renderWith } from './test-fixtures';

const push = vi.fn();
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push, refresh: vi.fn() }),
}));
const apis = vi.hoisted(() => ({
  CREATE_LISTING: vi.fn(),
  UPDATE_LISTING: vi.fn(),
  LOOKUP_LISTING_AREAS: vi.fn(() =>
    Promise.resolve({ success: true, status: 200, data: [] }),
  ),
}));
vi.mock('@/apis', () => apis);
vi.mock('sonner', () => ({ toast: { error: vi.fn(), success: vi.fn() } }));

beforeEach(() => {
  push.mockReset();
  apis.CREATE_LISTING.mockReset();
});

async function fillDirect(user: ReturnType<typeof userEvent.setup>) {
  await user.type(screen.getByTestId('owner-name'), 'Nadia Fathy');
  await user.type(screen.getByTestId('owner-phone-input'), '01004821937');
  await user.click(screen.getByRole('button', { name: 'For sale' }));
  await user.click(screen.getByRole('button', { name: 'Apartment' }));
  await user.type(screen.getByRole('combobox'), 'New Cairo');
  await user.type(screen.getByTestId('size-input'), '185');
  await user.type(screen.getByTestId('price-input'), '8500000');
}

describe('Listing form', () => {
  it('blocks submit until the required fields are valid', async () => {
    const user = userEvent.setup();
    renderWith(<ListingForm mode={{ kind: 'create', owner: null }} />);

    await user.click(screen.getByTestId('listing-submit'));
    expect(
      (await screen.findAllByText('Required')).length,
    ).toBeGreaterThanOrEqual(5);

    await user.type(screen.getByTestId('price-input'), '1000000001');
    await user.click(screen.getByTestId('listing-submit'));
    expect(
      await screen.findByText('Enter a whole price from 1 to 1,000,000,000.'),
    ).toBeInTheDocument();
    expect(apis.CREATE_LISTING).not.toHaveBeenCalled();
  });

  it('shows the price grouped and sends a whole number', async () => {
    const user = userEvent.setup();
    apis.CREATE_LISTING.mockResolvedValue({
      success: true,
      status: 201,
      data: listingFixture(),
    });
    renderWith(<ListingForm mode={{ kind: 'create', owner: null }} />);
    await fillDirect(user);
    await user.tab();
    expect(screen.getByTestId('price-input')).toHaveValue('8,500,000');

    await user.click(screen.getByTestId('listing-submit'));
    await vi.waitFor(() =>
      expect(apis.CREATE_LISTING).toHaveBeenCalledTimes(1),
    );
    expect(apis.CREATE_LISTING).toHaveBeenCalledWith(
      expect.objectContaining({
        ownerName: 'Nadia Fathy',
        ownerPhone: '01004821937',
        purpose: 'SALE',
        type: 'APARTMENT',
        area: 'New Cairo',
        sizeSqm: 185,
        price: 8_500_000,
      }),
    );
    await vi.waitFor(() => expect(push).toHaveBeenCalled());
  });

  it('puts a phone conflict on the phone field', async () => {
    const user = userEvent.setup();
    apis.CREATE_LISTING.mockResolvedValue({
      success: false,
      status: 409,
      error: 'PHONE_IN_LISTING',
      message: 'x',
    });
    renderWith(<ListingForm mode={{ kind: 'create', owner: null }} />);
    await fillDirect(user);
    await user.click(screen.getByTestId('listing-submit'));
    expect(
      await screen.findByText('Another listing already has this phone number.'),
    ).toBeInTheDocument();
    expect(screen.getByTestId('owner-phone-input')).toHaveAttribute(
      'aria-invalid',
      'true',
    );
  });

  it('says when the owner already has a listing', async () => {
    const user = userEvent.setup();
    apis.CREATE_LISTING.mockResolvedValue({
      success: false,
      status: 409,
      error: 'OWNER_ALREADY_LISTED',
      message: 'x',
    });
    renderWith(
      <ListingForm
        mode={{
          kind: 'create',
          owner: {
            id: '44444444-4444-4444-8444-444444444444',
            name: 'Karim Mansour',
            area: 'Madinaty',
          } as never,
        }}
      />,
    );
    expect(screen.getByTestId('source-owner')).toHaveTextContent(
      'Karim Mansour',
    );
    expect(screen.getByRole('combobox')).toHaveValue('Madinaty');
    await user.click(screen.getByRole('button', { name: 'For sale' }));
    await user.click(screen.getByRole('button', { name: 'Villa' }));
    await user.type(screen.getByTestId('size-input'), '300');
    await user.type(screen.getByTestId('price-input'), '12000000');
    await user.click(screen.getByTestId('listing-submit'));
    expect(await screen.findByTestId('form-error')).toHaveTextContent(
      'This owner already has a listing.',
    );
    expect(apis.CREATE_LISTING).toHaveBeenCalledWith(
      expect.objectContaining({
        ownerId: '44444444-4444-4444-8444-444444444444',
      }),
    );
  });
});
