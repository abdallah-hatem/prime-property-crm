import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { RoleEditorDialog } from './roles/role-editor-dialog';
import { OutcomesManager } from './settings/outcomes-manager';
import {
  ADMIN_ID,
  adminRole,
  memberRole,
  outcomeFixture,
  renderAdmin,
  SARA_ID,
  userFixture,
} from './test-utils';
import { TrashView } from './trash/trash-view';
import { DeactivateDialog } from './users/deactivate-dialog';
import { UserFormDialog } from './users/user-form-dialog';
import { isLastActiveAdmin } from './users/user-rules';
import { UserSheet } from './users/user-sheet';

// jsdom lacks what Radix Checkbox / RadioGroup / Select measure with (candidates for vitest.setup).
globalThis.ResizeObserver ??= class {
  observe() {}
  unobserve() {}
  disconnect() {}
};
Element.prototype.hasPointerCapture ??= () => false;
Element.prototype.releasePointerCapture ??= () => {};
Element.prototype.scrollIntoView ??= () => {};

const refresh = vi.fn();
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), refresh }),
  usePathname: () => '/admin',
  useSearchParams: () => new URLSearchParams(),
}));
const apis = vi.hoisted(() => ({
  CREATE_USER: vi.fn(),
  UPDATE_USER: vi.fn(),
  GET_USER: vi.fn(),
  GET_USER_OPTIONS: vi.fn(),
  DEACTIVATE_USER: vi.fn(),
  UPDATE_ROLE: vi.fn(),
  CREATE_ROLE: vi.fn(),
  DELETE_CALL_OUTCOME: vi.fn(),
  UPDATE_CALL_OUTCOME: vi.fn(),
  RESTORE_TRASH_ITEM: vi.fn(),
}));
vi.mock('@/apis', () => apis);
vi.mock('sonner', () => ({ toast: { error: vi.fn(), success: vi.fn() } }));

const OMAR_ID = '99999999-9999-4999-8999-999999999999';
const ok = <T,>(data: T) => ({ success: true, status: 200, data });

beforeEach(() => {
  for (const fn of Object.values(apis)) fn.mockReset();
  refresh.mockReset();
});

describe('Create user', () => {
  it('validates the email and the 11-digit 01 mobile before sending anything', async () => {
    const user = userEvent.setup();
    renderAdmin(
      <UserFormDialog
        mode={{ kind: 'create' }}
        roles={[adminRole, memberRole]}
        open
        onOpenChange={() => {}}
      />,
    );
    await user.type(screen.getByTestId('user-name'), 'Mona Adel');
    await user.type(screen.getByTestId('user-email'), 'mona@');
    await user.type(screen.getByTestId('user-phone'), '0101234567');
    await user.type(screen.getByTestId('user-password'), 'short');
    await user.click(screen.getByTestId('user-submit'));

    expect(
      screen.getByText('Enter an email like name@company.com.'),
    ).toBeInTheDocument();
    expect(
      screen.getByText('Enter an 11-digit mobile number starting with 01.'),
    ).toBeInTheDocument();
    expect(screen.getByText('Choose a role.')).toBeInTheDocument();
    expect(screen.getByText('Use at least 8 characters.')).toBeInTheDocument();
    expect(apis.CREATE_USER).not.toHaveBeenCalled();
  });

  it('never takes a 12th digit or a prefix other than 01', async () => {
    const user = userEvent.setup();
    renderAdmin(
      <UserFormDialog
        mode={{ kind: 'create' }}
        roles={[memberRole]}
        open
        onOpenChange={() => {}}
      />,
    );
    const phone = screen.getByTestId('user-phone');
    await user.type(phone, '010123456789');
    expect(phone).toHaveValue('01012345678');
    await user.clear(phone);
    await user.type(phone, '05');
    expect(phone).toHaveValue('0');
  });

  it('shows EMAIL_TAKEN on the email field', async () => {
    const user = userEvent.setup();
    apis.CREATE_USER.mockResolvedValue({
      success: false,
      status: 409,
      error: 'EMAIL_TAKEN',
      message: 'taken',
    });
    renderAdmin(
      <UserFormDialog
        mode={{ kind: 'create' }}
        roles={[memberRole]}
        open
        onOpenChange={() => {}}
      />,
    );
    await user.type(screen.getByTestId('user-name'), 'Mona Adel');
    await user.type(screen.getByTestId('user-email'), 'SARA@prime.test');
    await user.click(screen.getByTestId('user-role'));
    await user.click(
      await screen.findByRole('option', { name: 'Team member' }),
    );
    await user.type(screen.getByTestId('user-password'), 'Welcome@2026');
    await user.click(screen.getByTestId('user-submit'));

    expect(
      await screen.findByText('Another user already has this email.'),
    ).toBeInTheDocument();
    expect(apis.CREATE_USER).toHaveBeenCalledTimes(1);
    expect(apis.CREATE_USER.mock.calls[0]?.[0]).toMatchObject({
      email: 'SARA@prime.test',
      roleId: memberRole.id,
      language: 'ar',
    });
  });
});

describe('Deactivate', () => {
  function mockLoads() {
    apis.GET_USER.mockResolvedValue(
      ok({
        ...userFixture(),
        counts: { owners: 12, listings: 3, openReminders: 5 },
      }),
    );
    apis.GET_USER_OPTIONS.mockResolvedValue(
      ok([
        { id: SARA_ID, name: 'Sara Mahmoud' },
        { id: OMAR_ID, name: 'Omar Nabil' },
      ]),
    );
  }

  it('requires a hand-over choice and shows what will move', async () => {
    const user = userEvent.setup();
    mockLoads();
    apis.DEACTIVATE_USER.mockResolvedValue(ok(userFixture({ active: false })));
    renderAdmin(
      <DeactivateDialog user={userFixture()} open onOpenChange={() => {}} />,
    );
    const counts = await screen.findByTestId('handover-counts');
    expect(within(counts).getByText('12')).toBeInTheDocument();
    expect(within(counts).getByText('5')).toBeInTheDocument();

    await user.click(screen.getByTestId('deactivate-submit'));
    expect(
      screen.getByText('Choose who receives their work.'),
    ).toBeInTheDocument();

    // Another user, but nobody picked yet.
    await user.click(screen.getByTestId('choice-member'));
    await user.click(screen.getByTestId('deactivate-submit'));
    expect(
      screen.getByText('Choose the person who receives it.'),
    ).toBeInTheDocument();
    expect(apis.DEACTIVATE_USER).not.toHaveBeenCalled();

    // The member being deactivated is never offered.
    await user.click(screen.getByTestId('handover-member'));
    expect(
      screen.queryByRole('option', { name: 'Sara Mahmoud' }),
    ).not.toBeInTheDocument();
    await user.click(screen.getByRole('option', { name: 'Omar Nabil' }));
    await user.click(screen.getByTestId('deactivate-submit'));
    await waitFor(() =>
      expect(apis.DEACTIVATE_USER).toHaveBeenCalledWith(SARA_ID, {
        handOverTo: OMAR_ID,
      }),
    );
  });

  it('sends null for "nobody" and works in Arabic', async () => {
    const user = userEvent.setup();
    mockLoads();
    apis.DEACTIVATE_USER.mockResolvedValue(ok(userFixture({ active: false })));
    renderAdmin(
      <DeactivateDialog user={userFixture()} open onOpenChange={() => {}} />,
      { locale: 'ar' },
    );
    await screen.findByTestId('handover-counts');
    expect(screen.getByRole('radiogroup')).toHaveAttribute('dir', 'rtl');
    await user.click(screen.getByTestId('choice-nobody'));
    await user.click(screen.getByTestId('deactivate-submit'));
    await waitFor(() =>
      expect(apis.DEACTIVATE_USER).toHaveBeenCalledWith(SARA_ID, {
        handOverTo: null,
      }),
    );
  });
});

describe('Last admin', () => {
  it('is only the active user on the Admin role when no other admin is active', () => {
    const admin = userFixture({
      id: ADMIN_ID,
      role: { id: adminRole.id, name: 'Admin' },
    });
    expect(isLastActiveAdmin(admin, adminRole.id, 1)).toBe(true);
    expect(isLastActiveAdmin(admin, adminRole.id, 2)).toBe(false);
    expect(isLastActiveAdmin(userFixture(), adminRole.id, 1)).toBe(false);
    expect(
      isLastActiveAdmin({ ...admin, active: false }, adminRole.id, 1),
    ).toBe(false);
  });

  it('disables Deactivate with the reason, and locks the role in the edit form', async () => {
    const admin = userFixture({
      id: OMAR_ID,
      name: 'Nour Admin',
      role: { id: adminRole.id, name: 'Admin' },
    });
    apis.GET_USER.mockResolvedValue(
      ok({ ...admin, counts: { owners: 0, listings: 0, openReminders: 0 } }),
    );
    const { unmount } = renderAdmin(
      <UserSheet
        user={admin}
        isSelf={false}
        lastAdmin
        open
        onOpenChange={() => {}}
        onAction={() => {}}
      />,
    );
    const deactivate = screen.getByTestId('user-action-deactivate');
    expect(deactivate).toBeDisabled();
    expect(
      screen.getByText(
        'Nour Admin is the only active admin. Make someone else an admin first.',
      ),
    ).toBeInTheDocument();
    unmount();

    renderAdmin(
      <UserFormDialog
        mode={{ kind: 'edit', user: admin, roleLocked: true }}
        roles={[adminRole, memberRole]}
        open
        onOpenChange={() => {}}
      />,
    );
    expect(screen.getByTestId('user-role')).toBeDisabled();
    expect(
      screen.getByText(
        'The only active admin stays on the Admin role. Make someone else an admin first.',
      ),
    ).toBeInTheDocument();
  });
});

describe('Role editor', () => {
  it("can't untick Admin's permissions, and saving Admin never sends them", async () => {
    const user = userEvent.setup();
    apis.UPDATE_ROLE.mockResolvedValue(ok(adminRole));
    renderAdmin(
      <RoleEditorDialog
        role={adminRole}
        open
        onOpenChange={() => {}}
        onDelete={() => {}}
      />,
    );
    const box = screen.getByTestId('permission-users.manage');
    expect(box).toBeDisabled();
    expect(box).toHaveAttribute('data-state', 'checked');
    await user.click(box);
    expect(box).toHaveAttribute('data-state', 'checked');
    expect(screen.getByTestId('role-delete')).toBeDisabled();
    expect(
      screen.getByText("Built-in roles can't be deleted."),
    ).toBeInTheDocument();

    await user.click(screen.getByTestId('role-submit'));
    await waitFor(() => expect(apis.UPDATE_ROLE).toHaveBeenCalledTimes(1));
    expect(apis.UPDATE_ROLE.mock.calls[0]?.[1]).toEqual({ name: 'Admin' });
  });

  it('blocks deleting a custom role someone holds, with the reason', () => {
    renderAdmin(
      <RoleEditorDialog
        role={{
          id: 'ffffffff-ffff-4fff-8fff-ffffffffffff',
          name: 'Team lead',
          builtIn: null,
          permissions: ['owners.assign'],
          userCount: 2,
        }}
        open
        onOpenChange={() => {}}
        onDelete={() => {}}
      />,
    );
    expect(screen.getByTestId('role-delete')).toBeDisabled();
    expect(screen.getByText(/Users still hold this role/)).toBeInTheDocument();
  });
});

describe('Call outcomes', () => {
  it('offers Hide when the delete is refused because calls use it', async () => {
    const user = userEvent.setup();
    const outcome = outcomeFixture();
    apis.DELETE_CALL_OUTCOME.mockResolvedValue({
      success: false,
      status: 409,
      error: 'OUTCOME_IN_USE',
      message: 'in use',
    });
    apis.UPDATE_CALL_OUTCOME.mockResolvedValue(
      ok({ ...outcome, hidden: true, inUse: true }),
    );
    renderAdmin(<OutcomesManager outcomes={[outcome]} />);

    await user.click(screen.getByTestId('outcome-delete'));
    await user.click(screen.getByRole('button', { name: 'Delete' }));

    const hide = await screen.findByRole('button', { name: 'Hide it' });
    expect(screen.getByText('Busy is used in calls')).toBeInTheDocument();
    await user.click(hide);
    await waitFor(() =>
      expect(apis.UPDATE_CALL_OUTCOME).toHaveBeenCalledWith(outcome.id, {
        hidden: true,
      }),
    );
  });

  it('goes straight to the Hide offer for an outcome already in use', async () => {
    const user = userEvent.setup();
    renderAdmin(
      <OutcomesManager outcomes={[outcomeFixture({ inUse: true })]} />,
    );
    await user.click(screen.getByTestId('outcome-delete'));
    expect(
      await screen.findByRole('button', { name: 'Hide it' }),
    ).toBeInTheDocument();
    expect(apis.DELETE_CALL_OUTCOME).not.toHaveBeenCalled();
  });
});

describe('Trash', () => {
  it('says why a restore was refused and keeps the item', async () => {
    const user = userEvent.setup();
    apis.RESTORE_TRASH_ITEM.mockResolvedValue({
      success: false,
      status: 409,
      error: 'OWNER_ALREADY_LISTED',
      message: 'conflict',
    });
    renderAdmin(
      <TrashView
        rows={[
          {
            kind: 'LISTING',
            id: '12121212-1212-4121-8121-121212121212',
            label: 'Apartment · 3 BR · Madinaty',
            deletedBy: { id: ADMIN_ID, name: 'Admin' },
            deletedAt: '2026-10-18T10:00:00.000Z',
            purgeAt: '2026-11-17T10:00:00.000Z',
          },
        ]}
        meta={{
          total: 1,
          page: 1,
          limit: 20,
          hasNextPage: false,
          hasPreviousPage: false,
        }}
        kind="ALL"
        now="2026-10-23T10:00:00.000Z"
      />,
    );
    expect(screen.getAllByText('25 days left').length).toBeGreaterThan(0);
    await user.click(screen.getAllByTestId('trash-restore')[0]!);
    expect(
      (
        await screen.findAllByText(
          "Its owner has another listing now, so this one can't come back.",
        )
      ).length,
    ).toBeGreaterThan(0);
    expect(refresh).not.toHaveBeenCalled();
  });
});
