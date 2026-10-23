import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type {
  Me,
  MemberAnalytics,
  MemberStats,
  Stats,
  TeamAnalytics,
} from '@prime-crm/shared';
import { adminMe, renderAdmin } from '@/components/admin/test-utils';
import { SessionProvider } from '@/components/session-provider';
import { I18nProvider } from '@/i18n/i18n-provider';
import { toCairo } from '@/lib/cairo-time';
import { AnalyticsView } from './analytics-view';
import { ExportButton } from './export-button';
import { MemberView } from './member-view';
import { presetRange, rangeQuery, resolveRange } from './range';

// jsdom lacks what Radix Select / Popover measure with.
globalThis.ResizeObserver ??= class {
  observe() {}
  unobserve() {}
  disconnect() {}
};
Element.prototype.hasPointerCapture ??= () => false;
Element.prototype.releasePointerCapture ??= () => {};
Element.prototype.scrollIntoView ??= () => {};

const nav = vi.hoisted(() => ({
  push: vi.fn(),
  search: new URLSearchParams(),
  pathname: '/analytics',
}));
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: nav.push, refresh: vi.fn() }),
  usePathname: () => nav.pathname,
  useSearchParams: () => nav.search,
}));
const actions = vi.hoisted(() => ({ DOWNLOAD_EXPORT: vi.fn() }));
vi.mock('./export-actions', () => actions);
const toast = vi.hoisted(() => ({ error: vi.fn(), success: vi.fn() }));
vi.mock('sonner', () => ({ toast }));

const SARA = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const KARIM = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
const OMAR = '99999999-9999-4999-8999-999999999999';
const TODAY = '2026-10-23';

const zero: Stats = {
  calls: 0,
  outcomes: [],
  remindersDone: 0,
  remindersOverdue: 0,
  assignedOwners: 0,
  interestedOwners: 0,
  listingsCreated: 0,
  adsLive: 0,
  adsTakenDown: 0,
};
const member = (overrides: Partial<MemberStats>): MemberStats => ({
  ...zero,
  id: SARA,
  name: 'Sara Mahmoud',
  active: true,
  ...overrides,
});
const team = (members: MemberStats[], totals: Partial<Stats> = {}) =>
  ({
    range: { from: TODAY, to: TODAY },
    totals: { ...zero, ...totals },
    members,
  }) satisfies TeamAnalytics;

beforeEach(() => {
  nav.push.mockReset();
  nav.search = new URLSearchParams();
  nav.pathname = '/analytics';
  actions.DOWNLOAD_EXPORT.mockReset();
  toast.error.mockReset();
});

describe('Date range presets', () => {
  it('set the right from/to in Cairo days', () => {
    // A Friday: the Egyptian week started on Saturday the 17th.
    expect(presetRange('today', TODAY)).toEqual({ from: TODAY, to: TODAY });
    expect(presetRange('yesterday', TODAY)).toEqual({
      from: '2026-10-22',
      to: '2026-10-22',
    });
    expect(presetRange('thisWeek', TODAY)).toEqual({
      from: '2026-10-17',
      to: TODAY,
    });
    expect(presetRange('thisWeek', '2026-10-17')).toEqual({
      from: '2026-10-17',
      to: '2026-10-17',
    });
    expect(presetRange('last7', TODAY)).toEqual({
      from: '2026-10-17',
      to: TODAY,
    });
    expect(presetRange('thisMonth', TODAY)).toEqual({
      from: '2026-10-01',
      to: TODAY,
    });
    expect(presetRange('last30', TODAY)).toEqual({
      from: '2026-09-24',
      to: TODAY,
    });
    expect(presetRange('yesterday', '2026-03-01')).toEqual({
      from: '2026-02-28',
      to: '2026-02-28',
    });
  });

  it('count "today" in Cairo, not in UTC or the phone zone', () => {
    // 22:30 UTC on the 22nd is already 01:30 on the 23rd in Cairo (summer time, +03:00).
    const today = toCairo(new Date('2026-10-22T22:30:00Z')).day;
    expect(today).toBe(TODAY);
    expect(resolveRange({ range: 'yesterday' }, today)).toEqual({
      preset: 'yesterday',
      from: '2026-10-22',
      to: '2026-10-22',
    });
  });

  it('read custom dates from the URL: one date is that day, reversed swapped, capped at 366 days', () => {
    expect(resolveRange({}, TODAY)).toEqual({
      preset: 'today',
      from: TODAY,
      to: TODAY,
    });
    expect(resolveRange({ from: '2026-10-05' }, TODAY)).toMatchObject({
      from: '2026-10-05',
      to: '2026-10-05',
    });
    expect(
      resolveRange({ from: '2026-10-10', to: '2026-10-01' }, TODAY),
    ).toMatchObject({ preset: 'custom', from: '2026-10-01', to: '2026-10-10' });
    expect(
      resolveRange({ from: '2024-01-01', to: '2026-10-23' }, TODAY),
    ).toMatchObject({ from: '2025-10-23', to: '2026-10-23' });
    expect(resolveRange({ from: '2026-02-30' }, TODAY).preset).toBe('today');
  });

  it('a preset pill puts the preset in the URL without scrolling', async () => {
    const user = userEvent.setup();
    renderAdmin(
      <AnalyticsView
        data={team([member({ calls: 3 })], { calls: 3 })}
        range={{ preset: 'today', from: TODAY, to: TODAY }}
        today={TODAY}
      />,
    );
    await user.click(screen.getByRole('button', { name: 'Last 7 days' }));
    expect(nav.push).toHaveBeenCalledWith('/analytics?range=last7', {
      scroll: false,
    });
    expect(screen.getByRole('button', { name: 'Today' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
  });

  it('a custom range presses the Custom pill and shows its dates', () => {
    renderAdmin(
      <AnalyticsView
        data={team([member({ calls: 3 })], { calls: 3 })}
        range={{ preset: 'custom', from: '2026-10-02', to: '2026-10-09' }}
        today={TODAY}
      />,
    );
    const custom = screen.getByTestId('range-custom');
    expect(custom).toHaveAttribute('aria-pressed', 'true');
    expect(custom).toHaveTextContent('2 Oct – 9 Oct');
    for (const button of screen.getAllByRole('button', { pressed: true }))
      expect(button).toBe(custom);
  });
});

describe('Empty range state', () => {
  it('says nothing happened and offers the last 30 days', async () => {
    const user = userEvent.setup();
    renderAdmin(
      <AnalyticsView
        data={team([member({ assignedOwners: 4 })], { assignedOwners: 4 })}
        range={{ preset: 'today', from: TODAY, to: TODAY }}
        today={TODAY}
      />,
    );
    expect(
      screen.getByText('Nothing happened in this range'),
    ).toBeInTheDocument();
    expect(screen.queryByTestId('outcomes-chart')).not.toBeInTheDocument();
    // Counts at the end of the range still show.
    expect(screen.getByTestId('stat-assignedOwners')).toHaveTextContent('4');
    await user.click(
      screen.getByRole('button', { name: 'Show the last 30 days' }),
    );
    expect(nav.push).toHaveBeenCalledWith('/analytics?range=last30', {
      scroll: false,
    });
  });

  it('in Arabic, with no offer when the range already is the last 30 days', () => {
    renderAdmin(
      <MemberView
        data={{
          ...member({ name: 'عمر الشريف', id: OMAR }),
          range: { from: '2026-09-24', to: TODAY },
          byDay: [],
        }}
        range={{ preset: 'last30', from: '2026-09-24', to: TODAY }}
        today={TODAY}
      />,
      { locale: 'ar' },
    );
    expect(screen.getByText('لم يحدث شيء في هذه الفترة')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'عرض آخر 30 يومًا' })).toBe(
      null,
    );
    expect(screen.queryByTestId('calls-by-day')).not.toBeInTheDocument();
  });
});

describe('Member drill-down', () => {
  const members = [
    member({ id: SARA, name: 'Sara Mahmoud', calls: 9 }),
    member({ id: OMAR, name: 'Omar Sherif', calls: 25 }),
    member({ id: KARIM, name: 'Karim Fawzy', calls: 4, active: false }),
  ];

  it('a member opens their analytics for the same range; deactivated members are marked', async () => {
    const user = userEvent.setup();
    renderAdmin(
      <AnalyticsView
        data={team(members, { calls: 38 })}
        range={{ preset: 'last7', from: '2026-10-17', to: TODAY }}
        today={TODAY}
      />,
    );
    const table = screen.getByTestId('member-table');
    const links = within(table).getAllByRole('link', {
      name: /Open Sara Mahmoud/,
    });
    for (const link of links)
      expect(link).toHaveAttribute(
        'href',
        `/analytics/members/${SARA}?range=last7`,
      );
    const karim = within(table).getAllByRole('link', { name: /Karim/ })[0]!;
    expect(karim).toHaveTextContent('Deactivated');

    // A tap anywhere on the table row goes there too.
    await user.click(within(within(table).getByRole('table')).getByText('25'));
    expect(nav.push).toHaveBeenCalledWith(
      `/analytics/members/${OMAR}?range=last7`,
    );
  });

  it('the table sorts by calls, most first, and the direction flips', async () => {
    const user = userEvent.setup();
    renderAdmin(
      <AnalyticsView
        data={team(members, { calls: 38 })}
        range={{ preset: 'today', from: TODAY, to: TODAY }}
        today={TODAY}
      />,
    );
    const order = () =>
      within(screen.getByTestId('member-table'))
        .getAllByTestId('member-card')
        .map((card) => card.textContent?.match(/Sara|Omar|Karim/)?.[0]);
    expect(order()).toEqual(['Omar', 'Sara', 'Karim']);
    await user.click(screen.getByTestId('member-sort-direction'));
    expect(order()).toEqual(['Karim', 'Sara', 'Omar']);
  });

  it('member detail shows their stats and calls by day, with a way back to the team for the range', () => {
    const data: MemberAnalytics = {
      ...member({ calls: 3, remindersOverdue: 2 }),
      range: { from: '2026-10-21', to: TODAY },
      byDay: [
        { date: '2026-10-21', calls: 1 },
        { date: '2026-10-22', calls: 0 },
        { date: TODAY, calls: 2 },
      ],
    };
    renderAdmin(
      <MemberView
        data={data}
        range={{ preset: 'custom', from: '2026-10-21', to: TODAY }}
        today={TODAY}
      />,
    );
    expect(screen.getByTestId('stat-calls')).toHaveTextContent('3');
    expect(screen.getByTestId('stat-remindersOverdue')).toHaveTextContent('2');
    const chart = screen.getByTestId('calls-by-day');
    const rows = within(chart).getAllByRole('row');
    expect(rows.slice(1).map((r) => r.textContent)).toEqual([
      '21 Oct1',
      '22 Oct0',
      '23 Oct2',
    ]);
    expect(
      screen.getByRole('link', { name: 'Back to the team' }),
    ).toHaveAttribute(
      'href',
      `/analytics${rangeQuery({ preset: 'custom', from: '2026-10-21', to: TODAY })}`,
    );
  });
});

describe('Export button', () => {
  const deferred = <T,>() => {
    let resolve!: (value: T) => void;
    const promise = new Promise<T>((r) => (resolve = r));
    return { promise, resolve };
  };

  it('sends the list filters without paging, is busy while downloading and sends one request', async () => {
    const user = userEvent.setup();
    nav.search = new URLSearchParams('q=nour&status=NEW&page=3&sort=name');
    const pending = deferred<unknown>();
    actions.DOWNLOAD_EXPORT.mockReturnValue(pending.promise);
    const createObjectURL = vi.fn(() => 'blob:x');
    URL.createObjectURL = createObjectURL;
    URL.revokeObjectURL = vi.fn();
    const click = vi
      .spyOn(HTMLAnchorElement.prototype, 'click')
      .mockImplementation(() => {});

    renderAdmin(<ExportButton kind="owners" />);
    const button = screen.getByTestId('export-owners');
    await user.click(button);
    expect(button).toBeDisabled();
    expect(button).toHaveAttribute('aria-busy', 'true');
    expect(button).toHaveTextContent('Preparing file…');
    await user.click(button);
    expect(actions.DOWNLOAD_EXPORT).toHaveBeenCalledTimes(1);
    expect(actions.DOWNLOAD_EXPORT).toHaveBeenCalledWith('owners', {
      q: 'nour',
      status: ['NEW'],
      assignedTo: undefined,
      area: undefined,
      importId: undefined,
      hasReminder: undefined,
      sort: 'name',
    });

    pending.resolve({
      success: true,
      status: 200,
      data: { fileName: 'owners-2026-10-23.xlsx', base64: 'UEsDBA==' },
    });
    await waitFor(() => expect(button).toBeEnabled());
    expect(createObjectURL).toHaveBeenCalledTimes(1);
    expect(click).toHaveBeenCalledTimes(1);
    expect(button).toHaveTextContent('Export to Excel');
    click.mockRestore();
  });

  it('EXPORT_TOO_LARGE says to narrow the filters and frees the button', async () => {
    const user = userEvent.setup();
    nav.search = new URLSearchParams('purpose=SALE&page=2');
    actions.DOWNLOAD_EXPORT.mockResolvedValue({
      success: false,
      status: 400,
      error: 'EXPORT_TOO_LARGE',
      message: 'Too many rows',
    });
    renderAdmin(<ExportButton kind="listings" />, { locale: 'ar' });
    const button = screen.getByTestId('export-listings');
    await user.click(button);
    await waitFor(() =>
      expect(toast.error).toHaveBeenCalledWith(
        'عدد الصفوف أكبر من أن يُصدَّر (أكثر من 50,000). ضيّق عوامل التصفية وحاول مرة أخرى.',
      ),
    );
    expect(actions.DOWNLOAD_EXPORT).toHaveBeenCalledWith('listings', {
      purpose: 'SALE',
    });
    expect(button).toBeEnabled();
  });

  it('is not there without data.export', () => {
    const me = { ...adminMe, permissions: ['owners.viewAll'] } as Me;
    render(
      <SessionProvider me={me}>
        <I18nProvider locale="en">
          <ExportButton kind="owners" />
        </I18nProvider>
      </SessionProvider>,
    );
    expect(screen.queryByTestId('export-owners')).not.toBeInTheDocument();
  });
});
