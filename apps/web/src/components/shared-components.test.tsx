import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { I18nProvider } from '@/i18n/i18n-provider';
import { ConfirmDialog } from './confirm-dialog';
import { DataList, type DataColumn } from './data-list';
import { FilterChips } from './filter-chips';
import { MoneyText } from './money-text';
import { PhoneInput } from './phone-input';
import { Calendar } from './ui/calendar';
import { Checkbox } from './ui/checkbox';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from './ui/select';

const push = vi.fn();
vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh: vi.fn(), push }),
  usePathname: () => '/owners',
  useSearchParams: () => new URLSearchParams('status=NEW&page=2'),
}));

const wrap = (ui: React.ReactNode, locale: 'en' | 'ar' = 'en') =>
  render(<I18nProvider locale={locale}>{ui}</I18nProvider>);

interface Row {
  id: string;
  name: string;
}
const columns: DataColumn<Row>[] = [
  { id: 'name', header: 'Name', cell: (r) => r.name },
];

describe('DataList', () => {
  it('shows skeleton rows on first load, then the empty state', () => {
    const { rerender, container } = wrap(
      <DataList
        label="Owners"
        columns={columns}
        rows={undefined}
        rowKey={(r) => r.id}
        skeletonRows={4}
        empty={{}}
      />,
    );
    expect(
      container.querySelectorAll('[data-slot="skeleton"]').length,
    ).toBeGreaterThanOrEqual(4);
    expect(screen.getByRole('region', { name: 'Owners' })).toHaveAttribute(
      'aria-busy',
      'true',
    );

    rerender(
      <I18nProvider locale="en">
        <DataList
          label="Owners"
          columns={columns}
          rows={[]}
          rowKey={(r) => r.id}
          empty={{ body: 'Import a file' }}
        />
      </I18nProvider>,
    );
    expect(screen.getByText('Nothing here yet')).toBeInTheDocument();
    expect(screen.getByText('Import a file')).toBeInTheDocument();
  });

  it('pages through the URL without scrolling, keeping the other params', async () => {
    const user = userEvent.setup();
    wrap(
      <DataList
        label="Owners"
        columns={columns}
        rows={[{ id: '1', name: 'Mona' }]}
        rowKey={(r) => r.id}
        empty={{}}
        meta={{
          total: 45,
          page: 2,
          limit: 20,
          hasNextPage: true,
          hasPreviousPage: true,
        }}
      />,
    );
    expect(screen.getByText('21–40 of 45')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Next page' }));
    expect(push).toHaveBeenCalledWith('/owners?status=NEW&page=3', {
      scroll: false,
    });
    await user.click(screen.getByRole('button', { name: 'Previous page' }));
    expect(push).toHaveBeenLastCalledWith('/owners?status=NEW', {
      scroll: false,
    });
  });

  it('keeps a 200-character name on one truncated line', () => {
    const long = 'م'.repeat(200);
    wrap(
      <DataList
        label="Owners"
        columns={columns}
        rows={[{ id: '1', name: long }]}
        rowKey={(r) => r.id}
        empty={{}}
      />,
      'ar',
    );
    for (const cell of screen.getAllByText(long))
      expect(cell.closest('.truncate')).not.toBeNull();
  });
});

describe('ConfirmDialog', () => {
  it('runs the action once however often confirm is pressed, then closes', async () => {
    let finish: () => void = () => {};
    const onConfirm = vi.fn(() => new Promise<void>((r) => (finish = r)));
    function Harness() {
      const [open, setOpen] = useState(true);
      return (
        <ConfirmDialog
          open={open}
          onOpenChange={setOpen}
          title="Delete owner?"
          confirmLabel="Delete"
          destructive
          onConfirm={onConfirm}
        />
      );
    }
    const user = userEvent.setup();
    wrap(<Harness />);
    const confirm = screen.getByRole('button', { name: 'Delete' });
    await user.click(confirm);
    await user.click(confirm);
    expect(onConfirm).toHaveBeenCalledTimes(1);
    expect(screen.getByRole('button', { name: 'Working…' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Cancel' })).toBeDisabled();
    finish();
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
  });
});

describe('PhoneInput', () => {
  function Harness() {
    const [value, setValue] = useState('');
    return <PhoneInput aria-label="Phone" value={value} onChange={setValue} />;
  }

  it('never takes a 12th digit and normalises a pasted +20 number', async () => {
    const user = userEvent.setup();
    wrap(<Harness />);
    const input = screen.getByRole('textbox', { name: 'Phone' });
    expect(input).not.toHaveAttribute('maxLength');
    await user.type(input, '010123456789');
    expect(input).toHaveValue('01012345678');

    await user.clear(input);
    await user.click(input);
    await user.paste('+20 10 1234 5678');
    expect(input).toHaveValue('01012345678');
  });
});

describe('MoneyText', () => {
  it('groups whole EGP in both languages', () => {
    const { unmount } = wrap(<MoneyText value={1500000} />);
    expect(screen.getByText(/EGP/).textContent).toBe('EGP 1,500,000');
    unmount();
    wrap(<MoneyText value={1500000} />, 'ar');
    expect(screen.getByText(/ج\.م/).textContent).toBe('1,500,000 ج.م');
  });
});

describe('Select under Arabic', () => {
  function Picker() {
    const [value, setValue] = useState('NEW');
    return (
      <Select value={value} onValueChange={setValue}>
        <SelectTrigger aria-label="Status" data-testid="status-select">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="NEW">جديد</SelectItem>
          <SelectItem value="INTERESTED">مهتم</SelectItem>
        </SelectContent>
      </Select>
    );
  }

  it('mirrors in RTL: the trigger and its list read right to left, and a choice still lands', async () => {
    const user = userEvent.setup();
    wrap(<Picker />, 'ar');
    const trigger = screen.getByTestId('status-select');
    expect(trigger).toHaveAttribute('dir', 'rtl');

    await user.click(trigger);
    const list = await screen.findByRole('listbox');
    expect(list).toHaveAttribute('dir', 'rtl');
    await user.click(screen.getByRole('option', { name: 'مهتم' }));
    await waitFor(() => expect(trigger).toHaveTextContent('مهتم'));
  });

  it('stays left to right in English', () => {
    wrap(<Picker />, 'en');
    expect(screen.getByTestId('status-select')).toHaveAttribute('dir', 'ltr');
  });
});

describe('DataList header', () => {
  it('takes a control as a column header (a select-page checkbox)', async () => {
    const user = userEvent.setup();
    const onPage = vi.fn();
    wrap(
      <DataList
        label="Owners"
        columns={[
          {
            id: 'select',
            header: (
              <Checkbox
                checked={false}
                onCheckedChange={onPage}
                label="Select this page"
              />
            ),
            cell: () => null,
          },
          ...columns,
        ]}
        rows={[{ id: '1', name: 'Nadia' }]}
        rowKey={(r) => r.id}
        empty={{}}
      />,
    );
    const header = screen.getByRole('columnheader', {
      name: 'Select this page',
    });
    await user.click(within(header).getByRole('checkbox'));
    expect(onPage).toHaveBeenCalledWith(true);
  });
});

describe('Calendar', () => {
  const month = new Date(2026, 9, 1); // October 2026

  it('weeks start on Saturday by default, and on the day asked for', () => {
    const { unmount } = wrap(<Calendar month={month} lang="en" />);
    const days = () =>
      screen
        .getAllByRole('columnheader', { hidden: true })
        .map((th) => th.getAttribute('aria-label'));
    expect(days()[0]).toBe('Saturday');
    unmount();
    wrap(<Calendar month={month} lang="en" weekStartsOn={0} />);
    expect(days()[0]).toBe('Sunday');
  });

  it('in Arabic the month arrows mirror with the grid and still move the right way', async () => {
    const user = userEvent.setup();
    const onMonthChange = vi.fn();
    wrap(
      <Calendar month={month} lang="ar" onMonthChange={onMonthChange} />,
      'ar',
    );
    const previous = screen.getByRole('button', { name: /السابق|previous/i });
    expect(previous.closest('[dir]')).toHaveAttribute('dir', 'rtl');
    // The icon flips with the reading direction (it points to the start edge, where it sits).
    expect(previous.querySelector('svg')).toHaveClass('flip-rtl');
    await user.click(previous);
    expect(onMonthChange).toHaveBeenCalledWith(new Date(2026, 8, 1));
  });
});

describe('FilterChips', () => {
  it('draws a trailing control in the same group, after the pills', () => {
    wrap(
      <FilterChips
        label="When"
        options={[
          { value: 'today', label: 'Today' },
          { value: 'week', label: 'This week' },
        ]}
        value="today"
        onChange={() => {}}
        trailing={<button type="button">Custom</button>}
      />,
    );
    const group = screen.getByRole('group', { name: 'When' });
    const buttons = within(group).getAllByRole('button');
    expect(buttons.map((b) => b.textContent)).toEqual([
      'Today',
      'This week',
      'Custom',
    ]);
  });
});
