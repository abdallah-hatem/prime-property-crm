import { act, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ImportJob, ImportPreview } from '@prime-crm/shared';
import {
  CONFIRM_IMPORT,
  GET_ASSIGNEE_OPTIONS,
  PREVIEW_IMPORT,
  UPLOAD_IMPORT,
} from '@/apis';
import { member, renderWith } from '@/components/listings/test-fixtures';
import { ImportWizard } from './import-wizard';

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
  usePathname: () => '/imports/new',
  useSearchParams: () => new URLSearchParams(''),
}));
vi.mock('@/apis', () => ({
  UPLOAD_IMPORT: vi.fn(),
  PREVIEW_IMPORT: vi.fn(),
  CONFIRM_IMPORT: vi.fn(),
  GET_ASSIGNEE_OPTIONS: vi.fn(),
}));
const toast = vi.hoisted(() => ({ error: vi.fn(), success: vi.fn() }));
vi.mock('sonner', () => ({ toast }));

beforeAll(() => {
  Element.prototype.hasPointerCapture = () => false;
  Element.prototype.setPointerCapture = () => undefined;
  Element.prototype.releasePointerCapture = () => undefined;
  Element.prototype.scrollIntoView = () => undefined;
});

const JOB_ID = '44444444-4444-4444-8444-444444444444';
const OWNER_ID = '55555555-5555-4555-8555-555555555555';
const SARA = { id: '66666666-6666-4666-8666-666666666666', name: 'Sara' };

const job = (overrides: Partial<ImportJob> = {}): ImportJob => ({
  id: JOB_ID,
  kind: 'OWNERS',
  fileName: 'owners.csv',
  status: 'MAPPING',
  headers: ['Full name', 'Mobile', 'Area'],
  mapping: { name: 'Full name', phone: 'Mobile', area: 'Area' },
  counts: null,
  assignTo: null,
  totalRows: 5,
  createdBy: { id: SARA.id, name: 'Admin' },
  createdAt: '2026-10-23T10:00:00.000Z',
  ...overrides,
});

const counts = { total: 5, added: 2, duplicates: 2, rejected: 1 };
const preview: ImportPreview = {
  job: job({ status: 'PREVIEWED', counts }),
  sample: [
    { row: 1, name: 'Nadia Fathy', phone: '01001234567', area: 'Maadi' },
    { row: 2, name: 'Hany', phone: '01001234568', area: 'Maadi' },
  ],
  issues: [
    {
      row: 2,
      reason: 'DUPLICATE',
      field: 'phone',
      value: '01001234568',
      matches: { ownerId: OWNER_ID, listingId: null },
      inTrash: false,
    },
    {
      row: 4,
      reason: 'DUPLICATE',
      field: 'phone',
      value: '01001234568',
      matches: null,
      inTrash: false,
    },
    {
      row: 5,
      reason: 'INVALID_PHONE',
      field: 'phone',
      value: '123',
      matches: null,
      inTrash: false,
    },
  ],
};

const ok = <T,>(data: T) =>
  Promise.resolve({ success: true as const, status: 201, data });
const admin = member(SARA.id, ['owners.import', 'owners.assign']);
const csv = (name = 'owners.csv', size = 40) =>
  new File(['x'.repeat(size)], name, { type: 'text/csv' });

function renderWizard(locale: 'en' | 'ar' = 'en') {
  return renderWith(<ImportWizard kinds={['OWNERS']} canAssign />, {
    me: admin,
    locale,
  });
}

async function upload(user: ReturnType<typeof userEvent.setup>, file: File) {
  await user.upload(screen.getByTestId('file-input'), file);
}

/** Through upload and preview to the preview step. */
async function toPreview(user: ReturnType<typeof userEvent.setup>) {
  renderWizard();
  await upload(user, csv());
  await screen.findByTestId('step-columns');
  await user.click(screen.getByTestId('run-preview'));
  await screen.findByTestId('step-preview');
}

beforeEach(() => {
  vi.mocked(UPLOAD_IMPORT).mockReset();
  vi.mocked(PREVIEW_IMPORT).mockReset();
  vi.mocked(CONFIRM_IMPORT).mockReset();
  vi.mocked(GET_ASSIGNEE_OPTIONS).mockReset();
  vi.mocked(UPLOAD_IMPORT).mockImplementation(() => ok(job()));
  vi.mocked(PREVIEW_IMPORT).mockImplementation(() => ok(preview));
  vi.mocked(GET_ASSIGNEE_OPTIONS).mockImplementation(() => ok([SARA]));
  toast.error.mockReset();
});

describe('Import wizard', () => {
  it('refuses an unsupported or oversized file with the reason, before uploading', async () => {
    const user = userEvent.setup({ applyAccept: false });
    renderWizard();

    await upload(user, new File(['%PDF'], 'owners.pdf'));
    expect(screen.getByTestId('file-error')).toHaveTextContent(
      "That file type isn't supported. Use an .xlsx, .xls or .csv file.",
    );
    await upload(user, csv('big.xlsx', 4 * 1024 * 1024 + 1));
    expect(screen.getByTestId('file-error')).toHaveTextContent(
      'That file is over 4 MB.',
    );
    expect(UPLOAD_IMPORT).not.toHaveBeenCalled();

    // A file that only looks like a spreadsheet: the API's code, translated.
    vi.mocked(UPLOAD_IMPORT).mockImplementation(() =>
      Promise.resolve({
        success: false,
        status: 400,
        error: 'FILE_TYPE',
        message: 'Unsupported',
      }),
    );
    await upload(user, csv('renamed.csv'));
    await waitFor(() =>
      expect(screen.getByTestId('file-error')).toHaveTextContent(
        "That file type isn't supported.",
      ),
    );
    expect(screen.getByTestId('step-file')).toBeInTheDocument();
  });

  it('shows the limits and the refusal in Arabic', async () => {
    const user = userEvent.setup({ applyAccept: false });
    renderWizard('ar');
    expect(screen.getByText(/حتى 4 ميجابايت و20,000 صف/)).toBeInTheDocument();
    await upload(user, new File(['x'], 'owners.txt'));
    expect(screen.getByTestId('file-error')).toHaveTextContent(
      'نوع الملف غير مدعوم',
    );
  });

  it('requires name and phone to be mapped before previewing', async () => {
    const user = userEvent.setup();
    vi.mocked(UPLOAD_IMPORT).mockImplementation(() =>
      ok(job({ mapping: { area: 'Area' } })),
    );
    renderWizard();
    await upload(user, csv());
    await screen.findByTestId('step-columns');

    await user.click(screen.getByTestId('run-preview'));
    expect(screen.getByTestId('mapping-error')).toHaveTextContent(
      'Match Owner name, Phone to continue.',
    );
    expect(PREVIEW_IMPORT).not.toHaveBeenCalled();

    await user.click(screen.getByTestId('map-name'));
    await user.click(await screen.findByRole('option', { name: 'Full name' }));
    expect(screen.getByTestId('mapping-error')).toHaveTextContent(
      'Match Phone to continue.',
    );
    await user.click(screen.getByTestId('map-phone'));
    await user.click(await screen.findByRole('option', { name: 'Mobile' }));
    expect(screen.queryByTestId('mapping-error')).not.toBeInTheDocument();

    await user.click(screen.getByTestId('assignee-select'));
    await user.click(await screen.findByRole('option', { name: 'Sara' }));
    await user.click(screen.getByTestId('run-preview'));
    await screen.findByTestId('step-preview');
    expect(PREVIEW_IMPORT).toHaveBeenCalledWith(JOB_ID, {
      mapping: { name: 'Full name', phone: 'Mobile', area: 'Area' },
      assignTo: SARA.id,
    });
  });

  it('lists duplicates and rejected rows with their reasons, filterable', async () => {
    const user = userEvent.setup();
    await toPreview(user);

    const counts = screen.getByTestId('import-counts');
    expect(
      within(counts).getByText('Will be added').nextSibling,
    ).toHaveTextContent('2');
    expect(
      within(counts).getByText('Duplicates').nextSibling,
    ).toHaveTextContent('2');
    expect(within(counts).getByText('Rejected').nextSibling).toHaveTextContent(
      '1',
    );

    const list = screen.getByTestId('preview-issues');
    const issues = within(list).getAllByTestId('import-issue');
    expect(issues.map((i) => i.dataset.reason)).toEqual([
      'DUPLICATE',
      'DUPLICATE',
      'INVALID_PHONE',
    ]);
    expect(issues[0]).toHaveTextContent('Row 2');
    expect(
      within(issues[0]!).getByRole('link', {
        name: 'Already an owner: open it',
      }),
    ).toHaveAttribute('href', `/owners/${OWNER_ID}`);
    expect(issues[1]).toHaveTextContent('Repeats an earlier row of this file');
    expect(issues[2]).toHaveTextContent('Invalid phone');

    await user.click(screen.getByRole('button', { name: 'Invalid phone (1)' }));
    expect(within(list).getAllByTestId('import-issue')).toHaveLength(1);
    expect(within(list).getByTestId('import-issue')).toHaveTextContent('123');
  });

  it('locks Confirm while the import runs (one request) and reports the counts', async () => {
    const user = userEvent.setup();
    let resolve: (value: unknown) => void = () => undefined;
    vi.mocked(CONFIRM_IMPORT).mockImplementation(
      () => new Promise((r) => (resolve = r)) as never,
    );
    await toPreview(user);

    const confirm = screen.getByTestId('confirm-import');
    expect(confirm).toHaveTextContent('Import 2 rows');
    await user.click(confirm);
    expect(confirm).toBeDisabled();
    expect(confirm).toHaveTextContent('Importing…');
    expect(
      screen.getByRole('button', { name: 'Back to columns' }),
    ).toBeDisabled();
    await user.click(confirm);
    expect(CONFIRM_IMPORT).toHaveBeenCalledTimes(1);

    await act(async () =>
      resolve({
        success: true,
        status: 200,
        data: job({ status: 'DONE', counts }),
      }),
    );
    const report = await screen.findByTestId('step-report');
    const tiles = within(report).getByTestId('import-counts');
    expect(within(tiles).getByText('Added').nextSibling).toHaveTextContent('2');
    expect(within(tiles).getByText('Duplicates').nextSibling).toHaveTextContent(
      '2',
    );
    expect(within(tiles).getByText('Rejected').nextSibling).toHaveTextContent(
      '1',
    );
    expect(
      within(report).getByRole('link', { name: 'See imported owners' }),
    ).toHaveAttribute('href', `/owners?importId=${JOB_ID}`);
    expect(
      within(report).getByRole('link', { name: 'See skipped rows' }),
    ).toHaveAttribute('href', `/imports/${JOB_ID}`);
  });

  it('keeps the preview and says why when the import fails', async () => {
    const user = userEvent.setup();
    vi.mocked(CONFIRM_IMPORT).mockImplementation(() =>
      Promise.resolve({
        success: false,
        status: 500,
        error: 'IMPORT_FAILED',
        message: 'failed',
      }),
    );
    await toPreview(user);
    await user.click(screen.getByTestId('confirm-import'));
    await waitFor(() =>
      expect(toast.error).toHaveBeenCalledWith(
        'The import failed and nothing was saved. Preview it and try again.',
      ),
    );
    expect(screen.getByTestId('confirm-import')).toBeEnabled();
    expect(screen.getByTestId('step-preview')).toBeInTheDocument();
  });
});
