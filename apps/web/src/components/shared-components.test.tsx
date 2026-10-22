import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { I18nProvider } from '@/i18n/i18n-provider';
import { ConfirmDialog } from './confirm-dialog';
import { DataList, type DataColumn } from './data-list';
import { MoneyText } from './money-text';
import { PhoneInput } from './phone-input';

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
