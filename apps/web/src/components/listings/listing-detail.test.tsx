import { screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { ListingDetail } from './listing-detail';
import { OMAR_ID, listingFixture, member, renderWith } from './test-fixtures';

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
}));
vi.mock('@/apis', () => ({}));
vi.mock('sonner', () => ({ toast: { error: vi.fn(), success: vi.fn() } }));

describe('Listing detail', () => {
  it("hides the owner phone on someone else's listing, and says why", () => {
    renderWith(<ListingDetail listing={listingFixture()} />);

    const hidden = screen.getAllByTestId('phone-hidden')[0];
    expect(hidden).toHaveTextContent('Phone hidden — not your listing');
    expect(hidden).toHaveTextContent(
      'Only Omar Nabil and admins see this number.',
    );
    expect(screen.queryByTestId('call-owner')).not.toBeInTheDocument();
    // Read-only for a member who isn't on it: no edit, no photo manager, no ad actions.
    expect(screen.queryByTestId('edit-listing')).not.toBeInTheDocument();
    expect(screen.queryByTestId('photo-manager')).not.toBeInTheDocument();
    expect(screen.queryByTestId('set-live')).not.toBeInTheDocument();
  });

  it('shows the phone and Call owner on your own listing', () => {
    renderWith(
      <ListingDetail
        listing={listingFixture({
          ownerPhone: '+201004821937',
          ownerPhoneHidden: false,
        })}
      />,
      { me: member(OMAR_ID) },
    );
    const call = screen.getAllByTestId('call-owner')[0];
    expect(call).toHaveAttribute('href', 'tel:+201004821937');
    expect(screen.getAllByText('+20 100 482 1937')[0]).toBeInTheDocument();
    expect(screen.queryByTestId('phone-hidden')).not.toBeInTheDocument();
    expect(screen.getByTestId('edit-listing')).toBeInTheDocument();
  });

  it('flags an open take-down task to the listing member, in Arabic', () => {
    renderWith(
      <ListingDetail
        listing={listingFixture({
          status: 'SOLD',
          adStatus: 'LIVE',
          adTakeDownOpen: true,
          ad: {
            link: 'https://pf.eg/a',
            status: 'LIVE',
            postedAt: '2026-10-04T09:00:00.000Z',
            takenDownAt: null,
            lastCheckInAt: null,
            nextCheckInAt: null,
          },
        })}
      />,
      { me: member(OMAR_ID), locale: 'ar' },
    );
    expect(screen.getByTestId('take-down-banner')).toHaveTextContent(
      'احذف الإعلان من Property Finder',
    );
  });

  it('shows no take-down banner once the task is closed, even with the ad still Live', () => {
    renderWith(
      <ListingDetail
        listing={listingFixture({
          status: 'SOLD',
          adStatus: 'LIVE',
          adTakeDownOpen: false,
          ad: {
            link: 'https://pf.eg/a',
            status: 'LIVE',
            postedAt: '2026-10-04T09:00:00.000Z',
            takenDownAt: null,
            lastCheckInAt: null,
            nextCheckInAt: null,
          },
        })}
      />,
      { me: member(OMAR_ID) },
    );
    expect(screen.queryByTestId('take-down-banner')).not.toBeInTheDocument();
  });
});
