import { act, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Meta, OwnerRow } from '@prime-crm/shared';
import { ASSIGN_OWNERS, GET_ASSIGNEE_OPTIONS, GET_OWNER_IDS } from '@/apis';
import { member, renderWith } from '@/components/listings/test-fixtures';
import { SessionProvider } from '@/components/session-provider';
import { I18nProvider } from '@/i18n/i18n-provider';
import { AdminOwnersView } from './admin-owners-view';
import type { OwnerFilters } from './owner-filters';

const push = vi.fn();
const refresh = vi.fn();
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push, refresh }),
  usePathname: () => '/owners',
  useSearchParams: () => new URLSearchParams(''),
}));
vi.mock('@/apis', () => ({
  GET_OWNER_IDS: vi.fn(),
  ASSIGN_OWNERS: vi.fn(),
  GET_ASSIGNEE_OPTIONS: vi.fn(),
}));
const toast = vi.hoisted(() => ({ error: vi.fn(), success: vi.fn() }));
vi.mock('sonner', () => ({ toast }));

// Radix Select needs these in jsdom.
beforeAll(() => {
  Element.prototype.hasPointerCapture = () => false;
  Element.prototype.setPointerCapture = () => undefined;
  Element.prototype.releasePointerCapture = () => undefined;
  Element.prototype.scrollIntoView = () => undefined;
});

const uuid = (n: number) =>
  `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const SARA = { id: uuid(9001), name: 'Sara Mahmoud' };
const OMAR = { id: uuid(9002), name: 'عمر الشريف' };

const owner = (n: number, overrides: Partial<OwnerRow> = {}): OwnerRow => ({
  id: uuid(n),
  name: `Owner ${n}`,
  phones: ['+201001234567'],
  area: 'Maadi',
  status: 'NEW',
  assignedTo: null,
  lastCall: null,
  nextReminderAt: null,
  createdAt: '2026-10-01T10:00:00.000Z',
  ...overrides,
});

const meta = (total: number, page = 1): Meta => ({
  total,
  page,
  limit: 20,
  hasNextPage: page * 20 < total,
  hasPreviousPage: page > 1,
});

const noFilters: OwnerFilters = { q: '' };
const admin = member(uuid(1), [
  'owners.viewAll',
  'owners.assign',
  'owners.import',
]);

function renderView(
  props: Partial<React.ComponentProps<typeof AdminOwnersView>> = {},
) {
  const all = {
    rows: [owner(1), owner(2), owner(3, { assignedTo: SARA })],
    meta: meta(45),
    filters: noFilters,
    members: [SARA, OMAR],
    areas: ['Maadi'],
    imports: [],
    canAssign: true,
    canImport: true,
    now: '2026-10-23T10:00:00.000Z',
    ...props,
  };
  return { ...renderWith(<AdminOwnersView {...all} />, { me: admin }), all };
}

/** The same providers `renderWith` uses, for `rerender`. */
const wrap = (ui: React.ReactNode) => (
  <SessionProvider me={admin}>
    <I18nProvider locale="en">{ui}</I18nProvider>
  </SessionProvider>
);

const ok = <T,>(data: T) =>
  Promise.resolve({ success: true as const, status: 200, data });

beforeEach(() => {
  vi.mocked(GET_OWNER_IDS).mockReset();
  vi.mocked(ASSIGN_OWNERS).mockReset();
  vi.mocked(GET_ASSIGNEE_OPTIONS).mockReset();
  vi.mocked(GET_ASSIGNEE_OPTIONS).mockImplementation(() => ok([SARA, OMAR]));
  toast.success.mockReset();
  refresh.mockReset();
});

const dock = () => screen.getByTestId('selection-dock');
/** jsdom draws both the phone cards and the table: the first box of a row. */
const rowBox = (name: string) => screen.getAllByRole('checkbox', { name })[0]!;

describe('Admin owners table', () => {
  it('selects every matching owner across pages, then assigns them all', async () => {
    const user = userEvent.setup();
    const ids = Array.from({ length: 45 }, (_, i) => uuid(i + 1));
    vi.mocked(GET_OWNER_IDS).mockImplementation(() => ok({ ids, total: 45 }));
    vi.mocked(ASSIGN_OWNERS).mockImplementation(() => ok({ moved: 45 }));
    renderView({ filters: { q: '', status: 'NEW', area: 'Maadi' } });

    await user.click(screen.getByTestId('select-all-matching'));
    expect(GET_OWNER_IDS).toHaveBeenCalledWith(
      expect.objectContaining({
        status: ['NEW'],
        area: 'Maadi',
        take: 5000,
      }),
    );
    expect(await screen.findByText('All 45 matching owners are selected.'));
    expect(dock()).toHaveTextContent('45 selected');

    await user.click(within(dock()).getByTestId('open-assign'));
    const dialog = await screen.findByRole('dialog');
    expect(dialog).toHaveTextContent('Assign 45 owners');
    await user.click(within(dialog).getByTestId('assignee-select'));
    await user.click(await screen.findByRole('option', { name: SARA.name }));
    await user.click(within(dialog).getByTestId('assign-confirm'));

    await waitFor(() => expect(ASSIGN_OWNERS).toHaveBeenCalledTimes(1));
    expect(ASSIGN_OWNERS).toHaveBeenCalledWith({
      ownerIds: ids,
      assigneeId: SARA.id,
    });
    await waitFor(() =>
      expect(toast.success).toHaveBeenCalledWith(
        'Moved 45 owners to Sara Mahmoud',
      ),
    );
    expect(screen.queryByTestId('selection-dock')).not.toBeInTheDocument();
    expect(refresh).toHaveBeenCalled();
  });

  it('keeps the selection when the page changes, drops it when the filters change', async () => {
    const user = userEvent.setup();
    const view = renderView();
    await user.click(rowBox('Select Owner 1'));
    await user.click(rowBox('Select Owner 2'));
    expect(dock()).toHaveTextContent('2 selected');

    view.rerender(
      wrap(
        <AdminOwnersView
          {...view.all}
          rows={[owner(21), owner(22)]}
          meta={meta(45, 2)}
        />,
      ),
    );
    await user.click(rowBox('Select Owner 21'));
    expect(dock()).toHaveTextContent('3 selected');

    view.rerender(
      wrap(
        <AdminOwnersView
          {...view.all}
          rows={[owner(21)]}
          filters={{ q: '', status: 'CALL_BACK' }}
        />,
      ),
    );
    expect(screen.queryByTestId('selection-dock')).not.toBeInTheDocument();
  });

  it('selects the next N unassigned owners and says when fewer exist', async () => {
    const user = userEvent.setup();
    const ids = Array.from({ length: 6 }, (_, i) => uuid(100 + i));
    vi.mocked(GET_OWNER_IDS).mockImplementation(() => ok({ ids, total: 6 }));
    renderView({ filters: { q: '', area: 'Maadi', assignedTo: SARA.id } });

    await user.click(screen.getByTestId('next-size'));
    await user.click(await screen.findByRole('option', { name: '200' }));
    await user.click(screen.getByTestId('select-next-unassigned'));

    expect(GET_OWNER_IDS).toHaveBeenCalledWith(
      expect.objectContaining({
        area: 'Maadi',
        assignedTo: 'unassigned',
        take: 200,
      }),
    );
    expect(
      await screen.findByText(
        'Only 6 unassigned owners match. All of them are selected.',
      ),
    );
    expect(dock()).toHaveTextContent('6 selected');
  });

  it('locks the bulk buttons while the ids load', async () => {
    const user = userEvent.setup();
    let resolve: (value: unknown) => void = () => undefined;
    vi.mocked(GET_OWNER_IDS).mockImplementation(
      () => new Promise((r) => (resolve = r)) as never,
    );
    renderView();
    await user.click(screen.getByTestId('select-all-matching'));
    expect(screen.getByTestId('select-all-matching')).toBeDisabled();
    expect(screen.getByTestId('select-next-unassigned')).toBeDisabled();
    await user.click(screen.getByTestId('select-all-matching'));
    expect(GET_OWNER_IDS).toHaveBeenCalledTimes(1);
    await act(async () =>
      resolve({ success: true, status: 200, data: { ids: [], total: 0 } }),
    );
    expect(screen.getByTestId('select-all-matching')).toBeEnabled();
  });

  it('hides selection and assign for someone who only sees all owners', () => {
    renderView({ canAssign: false });
    expect(screen.queryByRole('checkbox')).not.toBeInTheDocument();
    expect(screen.queryByTestId('select-all-matching')).not.toBeInTheDocument();
  });
});

describe('Assign dialog', () => {
  it('lists only the active members the API returns, plus Nobody, and sends one request', async () => {
    const user = userEvent.setup();
    let resolve: (value: unknown) => void = () => undefined;
    vi.mocked(ASSIGN_OWNERS).mockImplementation(
      () => new Promise((r) => (resolve = r)) as never,
    );
    renderView();
    await user.click(rowBox('Select Owner 1'));
    await user.click(screen.getByTestId('open-assign'));
    const dialog = await screen.findByRole('dialog');
    expect(GET_ASSIGNEE_OPTIONS).toHaveBeenCalledTimes(1);

    await user.click(within(dialog).getByTestId('assignee-select'));
    const options = await screen.findAllByRole('option');
    expect(options.map((o) => o.textContent)).toEqual([
      'Nobody (unassigned)',
      SARA.name,
      OMAR.name,
    ]);
    await user.click(
      screen.getByRole('option', { name: 'Nobody (unassigned)' }),
    );

    const confirm = within(dialog).getByTestId('assign-confirm');
    await user.click(confirm);
    expect(confirm).toBeDisabled();
    await user.click(confirm);
    expect(ASSIGN_OWNERS).toHaveBeenCalledTimes(1);
    expect(ASSIGN_OWNERS).toHaveBeenCalledWith({
      ownerIds: [uuid(1)],
      assigneeId: null,
    });
    await act(async () =>
      resolve({ success: true, status: 200, data: { moved: 1 } }),
    );
    expect(toast.success).toHaveBeenCalledWith('Unassigned 1 owners');
  });

  it('asks who gets them before sending anything', async () => {
    const user = userEvent.setup();
    renderView();
    await user.click(rowBox('Select Owner 2'));
    await user.click(screen.getByTestId('open-assign'));
    const dialog = await screen.findByRole('dialog');
    await waitFor(() =>
      expect(within(dialog).getByTestId('assign-confirm')).toBeEnabled(),
    );
    await user.click(within(dialog).getByTestId('assign-confirm'));
    expect(dialog).toHaveTextContent('Pick who gets them first.');
    expect(ASSIGN_OWNERS).not.toHaveBeenCalled();
  });

  it('says there is nobody to assign to when no member is active (in Arabic too)', async () => {
    const user = userEvent.setup();
    vi.mocked(GET_ASSIGNEE_OPTIONS).mockImplementation(() => ok([]));
    renderWith(
      <AdminOwnersView
        rows={[owner(1)]}
        meta={meta(1)}
        filters={noFilters}
        members={[]}
        areas={[]}
        imports={[]}
        canAssign
        canImport
        now="2026-10-23T10:00:00.000Z"
      />,
      { me: admin, locale: 'ar' },
    );
    await user.click(rowBox('تحديد Owner 1'));
    await user.click(screen.getByTestId('open-assign'));
    const dialog = await screen.findByRole('dialog');
    expect(
      await within(dialog).findByText('لا يوجد أعضاء نشطون في الفريق'),
    ).toBeInTheDocument();
    await user.click(within(dialog).getByTestId('assignee-select'));
    const options = await screen.findAllByRole('option');
    expect(options.map((o) => o.textContent)).toEqual(['لا أحد (غير معيّن)']);
  });
});
