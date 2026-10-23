import { act, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Call, CallOutcome, Me, Today } from '@prime-crm/shared';
import { SessionProvider } from '@/components/session-provider';
import { OwnerRow } from '@/components/today/owner-row';
import { TodayView } from '@/components/today/today-view';
import { I18nProvider } from '@/i18n/i18n-provider';
import type { ApiResult } from '@/lib/api-result';
import { CallButton } from './call-button';
import { CallFlowProvider, NO_DIALER_FALLBACK_MS } from './call-flow';
import { resetOutcomesCache } from './outcome-sheet';

const api = vi.hoisted(() => ({
  START_CALL: vi.fn(),
  GET_OWNER: vi.fn(),
  GET_CALL_OUTCOMES: vi.fn(),
  SET_CALL_OUTCOME: vi.fn(),
  GET_CALLING_LIST: vi.fn(),
}));
const openTel = vi.hoisted(() => vi.fn());
const refresh = vi.hoisted(() => vi.fn());

vi.mock('@/apis', () => api);
vi.mock('@/lib/tel', () => ({ openTel }));
vi.mock('sonner', () => ({ toast: { error: vi.fn(), success: vi.fn() } }));
vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh, push: vi.fn() }),
  usePathname: () => '/today',
  useSearchParams: () => new URLSearchParams(),
}));

const OWNER = {
  id: '11111111-1111-4111-8111-111111111111',
  name: 'Nadia Fathy',
  phones: ['+201004821937'],
};
const CALL: Call = {
  id: '22222222-2222-4222-8222-222222222222',
  owner: { id: OWNER.id, name: OWNER.name },
  member: { id: '33333333-3333-4333-8333-333333333333', name: 'Sara' },
  phone: '+201004821937',
  startedAt: new Date().toISOString(),
  outcome: null,
  note: null,
  outcomeAt: null,
};
const OUTCOMES: CallOutcome[] = [
  {
    id: '44444444-4444-4444-8444-444444444444',
    labelEn: 'No answer',
    labelAr: 'لا يرد',
    setsStatus: 'CONTACTED',
    hidden: false,
    order: 1,
    inUse: true,
  },
  {
    id: '55555555-5555-4555-8555-555555555555',
    labelEn: 'Interested to sell',
    labelAr: 'مهتم بالبيع',
    setsStatus: 'INTERESTED',
    hidden: false,
    order: 2,
    inUse: true,
  },
];
const ME = {
  id: CALL.member.id,
  name: 'Sara',
  permissions: [],
} as unknown as Me;

const ok = <T,>(data: T): ApiResult<T> => ({
  success: true,
  status: 200,
  data,
});

function renderWith(ui: React.ReactNode, locale: 'en' | 'ar' = 'en') {
  document.documentElement.lang = locale;
  document.documentElement.dir = locale === 'ar' ? 'rtl' : 'ltr';
  return render(
    <I18nProvider locale={locale}>
      <SessionProvider me={ME}>
        <CallFlowProvider>{ui}</CallFlowProvider>
      </SessionProvider>
    </I18nProvider>,
  );
}

/** The member leaves for the dialer and comes back. */
function leaveAndReturn() {
  act(() => {
    window.dispatchEvent(new Event('blur'));
  });
  act(() => {
    window.dispatchEvent(new Event('focus'));
  });
}

async function openSheetAfterCall(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByTestId('call-button'));
  await waitFor(() => expect(openTel).toHaveBeenCalled());
  leaveAndReturn();
  return screen.findByTestId('outcome-sheet');
}

beforeEach(() => {
  Object.values(api).forEach((fn) => fn.mockReset());
  openTel.mockReset();
  refresh.mockReset();
  resetOutcomesCache();
  api.START_CALL.mockResolvedValue(ok(CALL));
  api.GET_CALL_OUTCOMES.mockResolvedValue(ok(OUTCOMES));
  api.SET_CALL_OUTCOME.mockResolvedValue(
    ok({ ...CALL, outcomeAt: CALL.startedAt }),
  );
});
afterEach(() => {
  vi.useRealTimers();
});

describe('call flow', () => {
  it('creates the call once on a double tap and opens tel:', async () => {
    let resolve: (value: ApiResult<Call>) => void = () => {};
    api.START_CALL.mockReturnValue(new Promise((r) => (resolve = r)));
    const user = userEvent.setup();
    renderWith(<CallButton target={OWNER} />);

    const button = screen.getByTestId('call-button');
    await user.click(button);
    await user.click(button);
    expect(button).toBeDisabled();
    await act(async () => resolve(ok(CALL)));

    expect(api.START_CALL).toHaveBeenCalledTimes(1);
    const [ownerId, body] = api.START_CALL.mock.calls[0] as [
      string,
      { phone: string; clientRequestId: string },
    ];
    expect(ownerId).toBe(OWNER.id);
    expect(body.phone).toBe(OWNER.phones[0]);
    expect(body.clientRequestId).toMatch(/^[0-9a-f-]{36}$/);
    expect(openTel).toHaveBeenCalledTimes(1);
    expect(openTel).toHaveBeenCalledWith(CALL.phone);
  });

  it('reuses the client request id when the first try never reached the API', async () => {
    api.START_CALL.mockResolvedValueOnce({
      success: false,
      status: 0,
      message: 'Network error',
      networkError: true,
    });
    const user = userEvent.setup();
    renderWith(<CallButton target={OWNER} />);
    await user.click(screen.getByTestId('call-button'));
    await waitFor(() =>
      expect(screen.getByTestId('call-button')).toBeEnabled(),
    );
    await user.click(screen.getByTestId('call-button'));
    await waitFor(() => expect(openTel).toHaveBeenCalledTimes(1));

    const ids = api.START_CALL.mock.calls.map(
      (c) => (c[1] as { clientRequestId: string }).clientRequestId,
    );
    expect(ids[0]).toBe(ids[1]);
  });

  it('shows the outcome sheet when the member comes back from the dialer', async () => {
    const user = userEvent.setup();
    renderWith(<CallButton target={OWNER} />);
    await user.click(screen.getByTestId('call-button'));
    await waitFor(() => expect(openTel).toHaveBeenCalled());
    expect(screen.queryByTestId('outcome-sheet')).not.toBeInTheDocument();

    leaveAndReturn();
    const sheet = await screen.findByTestId('outcome-sheet');
    expect(within(sheet).getByText('How did the call go?')).toBeInTheDocument();
    expect(
      await within(sheet).findByRole('radio', { name: 'No answer' }),
    ).toBeInTheDocument();
  });

  it('opens the sheet anyway when there is no dialer to leave for', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    renderWith(<CallButton target={OWNER} />);
    await user.click(screen.getByTestId('call-button'));
    await waitFor(() => expect(openTel).toHaveBeenCalled());
    act(() => {
      vi.advanceTimersByTime(NO_DIALER_FALLBACK_MS + 10);
    });
    expect(await screen.findByTestId('outcome-sheet')).toBeInTheDocument();
  });

  it('asks which number when the owner has several', async () => {
    const user = userEvent.setup();
    renderWith(
      <CallButton
        target={{ ...OWNER, phones: ['+201004821937', '+201112223334'] }}
      />,
    );
    await user.click(screen.getByTestId('call-button'));
    await user.click(
      await screen.findByRole('button', { name: /0111 222 3334/ }),
    );
    await waitFor(() => expect(api.START_CALL).toHaveBeenCalledTimes(1));
    expect((api.START_CALL.mock.calls[0]![1] as { phone: string }).phone).toBe(
      '+201112223334',
    );
  });

  it('shows the translated refusal and opens no dialer for a Do not call owner', async () => {
    const { toast } = await import('sonner');
    api.START_CALL.mockResolvedValue({
      success: false,
      status: 409,
      error: 'DO_NOT_CALL',
      message: 'Owner is do not call',
    });
    const user = userEvent.setup();
    renderWith(<CallButton target={OWNER} />);
    await user.click(screen.getByTestId('call-button'));
    await waitFor(() =>
      expect(toast.error).toHaveBeenCalledWith(
        'This owner is marked Do not call.',
      ),
    );
    expect(openTel).not.toHaveBeenCalled();
  });
});

describe('outcome sheet', () => {
  it('requires an outcome before saving', async () => {
    const user = userEvent.setup();
    renderWith(<CallButton target={OWNER} />);
    const sheet = await openSheetAfterCall(user);
    await within(sheet).findByRole('radio', { name: 'No answer' });

    await user.click(within(sheet).getByTestId('outcome-save'));
    expect(within(sheet).getByText('Pick an outcome.')).toBeInTheDocument();
    expect(api.SET_CALL_OUTCOME).not.toHaveBeenCalled();

    await user.click(
      within(sheet).getByRole('radio', { name: 'Interested to sell' }),
    );
    await user.type(within(sheet).getByRole('textbox'), 'Wants a valuation');
    await user.click(within(sheet).getByTestId('outcome-save'));
    await waitFor(() =>
      expect(api.SET_CALL_OUTCOME).toHaveBeenCalledWith(CALL.id, {
        outcomeId: OUTCOMES[1]!.id,
        note: 'Wants a valuation',
      }),
    );
    await waitFor(() =>
      expect(screen.queryByTestId('outcome-sheet')).not.toBeInTheDocument(),
    );
    expect(refresh).toHaveBeenCalled();
  });

  it('blocks a reminder that is in the past', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    renderWith(<CallButton target={OWNER} />);
    const sheet = await openSheetAfterCall(user);
    await user.click(
      await within(sheet).findByRole('radio', { name: 'No answer' }),
    );
    await user.click(
      within(sheet).getByRole('button', { name: 'Add a reminder' }),
    );
    await user.click(within(sheet).getByRole('button', { name: 'In 2 hours' }));

    // The sheet stays open while the picked time passes.
    vi.setSystemTime(new Date(Date.now() + 3 * 60 * 60 * 1000));
    await user.click(within(sheet).getByTestId('outcome-save'));

    expect(
      within(sheet).getByText('Pick a time in the future.'),
    ).toBeInTheDocument();
    expect(api.SET_CALL_OUTCOME).not.toHaveBeenCalled();
  });

  it("shows the API's REMINDER_IN_PAST under the reminder, translated", async () => {
    api.SET_CALL_OUTCOME.mockResolvedValue({
      success: false,
      status: 400,
      error: 'REMINDER_IN_PAST',
      message: 'dueAt must be in the future',
    });
    const user = userEvent.setup();
    renderWith(<CallButton target={OWNER} />);
    const sheet = await openSheetAfterCall(user);
    await user.click(
      await within(sheet).findByRole('radio', { name: 'No answer' }),
    );
    await user.click(
      within(sheet).getByRole('button', { name: 'Add a reminder' }),
    );
    await user.click(
      within(sheet).getByRole('button', { name: 'Tomorrow 10:00' }),
    );
    await user.click(within(sheet).getByTestId('outcome-save'));

    expect(
      await within(sheet).findByText('Pick a time in the future.'),
    ).toBeInTheDocument();
    const body = api.SET_CALL_OUTCOME.mock.calls[0]![1] as {
      reminder?: { dueAt: string };
    };
    expect(body.reminder?.dueAt).toMatch(/T10:00:00\+0[23]:00$/);
  });

  it('renders right to left in Arabic, with Arabic outcome names', async () => {
    const user = userEvent.setup();
    renderWith(<CallButton target={OWNER} />, 'ar');
    const sheet = await openSheetAfterCall(user);
    expect(within(sheet).getByText('ما نتيجة المكالمة؟')).toBeInTheDocument();
    expect(
      await within(sheet).findByRole('radio', { name: 'لا يرد' }),
    ).toBeInTheDocument();
    expect(within(sheet).queryByText('No answer')).not.toBeInTheDocument();
    expect(document.documentElement.dir).toBe('rtl');
    expect(
      within(sheet).getByRole('button', { name: 'حفظ النتيجة' }),
    ).toBeInTheDocument();
  });
});

const EMPTY_TODAY: Today = {
  outcomeMissing: [],
  overdue: [],
  dueToday: [],
  adTasks: [],
  counts: {
    overdue: 0,
    dueToday: 0,
    outcomeMissing: 0,
    adTasks: 0,
    callsToday: 0,
    remindersOpen: 0,
  },
};
const EMPTY_PAGE = {
  rows: [],
  meta: {
    total: 0,
    page: 1,
    limit: 20,
    hasNextPage: false,
    hasPreviousPage: false,
  },
};

describe('Today', () => {
  it('shows the caught-up state when nothing is waiting and nobody is left to call', () => {
    renderWith(
      <TodayView
        today={EMPTY_TODAY}
        callingList={EMPTY_PAGE}
        now={new Date().toISOString()}
      />,
    );
    expect(screen.getByText("You're all caught up")).toBeInTheDocument();
    expect(screen.queryByTestId('call-button')).not.toBeInTheDocument();
  });

  it('counters show the API totals, not the length of the capped lists', () => {
    renderWith(
      <TodayView
        today={{
          ...EMPTY_TODAY,
          outcomeMissing: [CALL],
          counts: {
            ...EMPTY_TODAY.counts,
            overdue: 1284,
            dueToday: 55,
            outcomeMissing: 51,
          },
        }}
        callingList={EMPTY_PAGE}
        now={new Date().toISOString()}
      />,
    );
    expect(screen.getByText('1,284')).toBeInTheDocument();
    expect(screen.getByText('55')).toBeInTheDocument();
    // The counter and the Needs-an-outcome heading both say 51 while one call is listed.
    expect(screen.getAllByText('51')).toHaveLength(2);
    expect(screen.getAllByTestId('missing-outcome')).toHaveLength(1);
    expect(screen.queryByText("You're all caught up")).not.toBeInTheDocument();
  });

  it('opens the outcome sheet from an Outcome missing item', async () => {
    const user = userEvent.setup();
    renderWith(
      <TodayView
        today={{
          ...EMPTY_TODAY,
          outcomeMissing: [CALL],
          counts: { ...EMPTY_TODAY.counts, outcomeMissing: 1 },
        }}
        callingList={EMPTY_PAGE}
        now={new Date().toISOString()}
      />,
    );
    const item = screen.getByTestId('missing-outcome');
    expect(item).toHaveTextContent(/You called ⁨Nadia Fathy⁩ at/);
    await user.click(within(item).getByRole('button', { name: 'Add outcome' }));

    const sheet = await screen.findByTestId('outcome-sheet');
    await user.click(
      await within(sheet).findByRole('radio', { name: 'No answer' }),
    );
    await user.click(within(sheet).getByTestId('outcome-save'));
    await waitFor(() =>
      expect(api.SET_CALL_OUTCOME).toHaveBeenCalledWith(CALL.id, {
        outcomeId: OUTCOMES[0]!.id,
      }),
    );
    expect(api.START_CALL).not.toHaveBeenCalled();
  });

  it('keeps a long Arabic name on one row with its Call button', () => {
    const longName = 'عبد الرحمن محمد مصطفى الشناوي '.repeat(8).trim();
    renderWith(
      <OwnerRow
        urgency="overdue"
        name={longName}
        href={`/owners/${OWNER.id}`}
        detail="التجمع الخامس، القاهرة الجديدة"
        when="متأخرة 3 ساعة"
        action={<CallButton target={{ ...OWNER, name: longName }} />}
      />,
      'ar',
    );
    const row = screen.getByTestId('owner-row');
    // The name is cut to one line (full text in the tooltip), the text column can shrink,
    // and the Call button stays in the row.
    const name = within(row).getByTitle(longName);
    expect(name).toHaveClass('truncate');
    expect(name.closest('a')).toHaveClass('min-w-0');
    expect(row).toHaveClass('grid-cols-[auto_minmax(0,1fr)_auto]');
    expect(within(row).getByTestId('call-button')).toBeInTheDocument();
  });
});
