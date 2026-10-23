import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AdCard } from './ad-card';
import { LISTING_ID, listingFixture, renderWith } from './test-fixtures';

const apis = vi.hoisted(() => ({
  UPDATE_LISTING_AD: vi.fn(),
  LOG_LISTING_CHECK_IN: vi.fn(),
}));
vi.mock('@/apis', () => apis);
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
}));
vi.mock('sonner', () => ({ toast: { error: vi.fn(), success: vi.fn() } }));

const live = listingFixture({
  adStatus: 'LIVE',
  ad: {
    link: 'https://www.propertyfinder.eg/en/plp/sample.html',
    status: 'LIVE',
    postedAt: '2026-10-04T09:00:00.000Z',
    takenDownAt: null,
    lastCheckInAt: '2026-10-15T09:00:00.000Z',
    nextCheckInAt: '2026-10-22T09:00:00.000Z',
  },
});

beforeEach(() => {
  apis.UPDATE_LISTING_AD.mockReset();
  apis.LOG_LISTING_CHECK_IN.mockReset();
});

describe('Property Finder ad card', () => {
  it('sets an ad live only with a link', async () => {
    const user = userEvent.setup();
    const onUpdated = vi.fn();
    apis.UPDATE_LISTING_AD.mockResolvedValue({
      success: true,
      status: 200,
      data: live,
    });
    renderWith(
      <AdCard listing={listingFixture()} canManage onUpdated={onUpdated} />,
    );

    await user.click(screen.getByTestId('set-live'));
    await user.click(screen.getByTestId('save-live'));
    expect(
      screen.getByText('Paste the ad link to set it live.'),
    ).toBeInTheDocument();
    expect(apis.UPDATE_LISTING_AD).not.toHaveBeenCalled();

    await user.type(screen.getByTestId('ad-link'), 'propertyfinder listing');
    await user.click(screen.getByTestId('save-live'));
    expect(
      screen.getByText('Enter a full link starting with https://'),
    ).toBeInTheDocument();
    expect(apis.UPDATE_LISTING_AD).not.toHaveBeenCalled();

    await user.clear(screen.getByTestId('ad-link'));
    await user.type(
      screen.getByTestId('ad-link'),
      'https://www.propertyfinder.eg/en/plp/x.html',
    );
    await user.click(screen.getByTestId('save-live'));
    expect(apis.UPDATE_LISTING_AD).toHaveBeenCalledTimes(1);
    expect(apis.UPDATE_LISTING_AD).toHaveBeenCalledWith(LISTING_ID, {
      status: 'LIVE',
      link: 'https://www.propertyfinder.eg/en/plp/x.html',
    });
    await vi.waitFor(() => expect(onUpdated).toHaveBeenCalledWith(live));
  });

  it('shows the API refusal when the listing is no longer available', async () => {
    const user = userEvent.setup();
    apis.UPDATE_LISTING_AD.mockResolvedValue({
      success: false,
      status: 400,
      error: 'LISTING_NOT_AVAILABLE',
      message: 'x',
    });
    renderWith(
      <AdCard listing={listingFixture()} canManage onUpdated={vi.fn()} />,
    );
    await user.click(screen.getByTestId('set-live'));
    await user.type(screen.getByTestId('ad-link'), 'https://pf.eg/a');
    await user.click(screen.getByTestId('save-live'));
    expect(
      await screen.findByText(
        'Only an Available listing can have a live ad or a check-in.',
      ),
    ).toBeInTheDocument();
  });

  it('asks before a check-in says the home is no longer available', async () => {
    const user = userEvent.setup();
    apis.LOG_LISTING_CHECK_IN.mockResolvedValue({
      success: true,
      status: 200,
      data: { ...live, status: 'OFF_MARKET' },
    });
    renderWith(<AdCard listing={live} canManage onUpdated={vi.fn()} />);

    await user.click(screen.getByTestId('log-check-in'));
    await user.click(
      screen.getByRole('radio', { name: 'No longer available' }),
    );
    await user.click(screen.getByTestId('save-check-in'));

    expect(
      screen.getByText('Mark the home no longer available?'),
    ).toBeInTheDocument();
    expect(apis.LOG_LISTING_CHECK_IN).not.toHaveBeenCalled();

    await user.click(screen.getByTestId('confirm-off-market'));
    expect(apis.LOG_LISTING_CHECK_IN).toHaveBeenCalledTimes(1);
    expect(apis.LOG_LISTING_CHECK_IN).toHaveBeenCalledWith(LISTING_ID, {
      stillAvailable: false,
    });
  });

  it('logs a "still available" check-in straight away, with its note', async () => {
    const user = userEvent.setup();
    apis.LOG_LISTING_CHECK_IN.mockResolvedValue({
      success: true,
      status: 200,
      data: live,
    });
    renderWith(<AdCard listing={live} canManage onUpdated={vi.fn()} />);

    await user.click(screen.getByTestId('log-check-in'));
    await user.type(
      screen.getByRole('textbox', { name: 'Note' }),
      'Owner confirmed',
    );
    await user.click(screen.getByTestId('save-check-in'));

    expect(apis.LOG_LISTING_CHECK_IN).toHaveBeenCalledTimes(1);
    expect(apis.LOG_LISTING_CHECK_IN).toHaveBeenCalledWith(LISTING_ID, {
      stillAvailable: true,
      note: 'Owner confirmed',
    });
  });

  it('shows the facts and the link, but no actions, to someone else', () => {
    renderWith(<AdCard listing={live} canManage={false} onUpdated={vi.fn()} />);
    expect(screen.queryByTestId('log-check-in')).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Open ad' })).toHaveAttribute(
      'href',
      live.ad.link,
    );
  });
});
