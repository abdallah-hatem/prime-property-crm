'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { ChevronRight, UserPlus, UsersRound } from 'lucide-react';
import {
  USER_SEARCH_MAX_LENGTH,
  type Meta,
  type Role,
  type User,
} from '@prime-crm/shared';
import { REACTIVATE_USER } from '@/apis';
import { ConfirmDialog } from '@/components/confirm-dialog';
import { DataList, type DataColumn } from '@/components/data-list';
import { FilterChips } from '@/components/filter-chips';
import { PageHeader } from '@/components/page-header';
import { SearchField } from '@/components/search-field';
import { useSession } from '@/components/session-provider';
import { UserAvatar } from '@/components/shell/user-avatar';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useTranslation } from '@/i18n/i18n-provider';
import { UserText } from '@/components/user-text';
import { callApi } from '@/lib/callApi';
import { formatPhone } from '@/lib/format';
import { useUrlParams } from '@/lib/use-url-params';
import { cn } from '@/lib/utils';
import { DeactivateDialog } from './deactivate-dialog';
import { ResetPasswordDialog } from './reset-password-dialog';
import { UserFormDialog } from './user-form-dialog';
import { adminRoleOf, isLastActiveAdmin } from './user-rules';
import { UserSheet, UserStatusChip, type UserAction } from './user-sheet';

export type UserStatusFilter = 'all' | 'active' | 'inactive';

type Open =
  | { kind: 'none' }
  | { kind: 'create' }
  | { kind: UserAction | 'sheet'; user: User };

const ALL_ROLES = 'all';

/**
 * Users: search by name, email or mobile; role and status filters in the URL; a sheet per user
 * with edit, reset password and deactivate / reactivate.
 */
export function UsersView({
  rows,
  meta,
  q,
  roleId,
  status,
  roles,
  activeAdmins,
}: {
  rows: User[];
  meta: Meta;
  q: string;
  roleId: string | null;
  status: UserStatusFilter;
  roles: Role[];
  /** Active users on the Admin role; null when unknown. */
  activeAdmins: number | null;
}) {
  const { t } = useTranslation();
  const router = useRouter();
  const me = useSession();
  const { setParams, isPending } = useUrlParams();
  const [open, setOpen] = useState<Open>({ kind: 'none' });
  const adminRoleId = adminRoleOf(roles)?.id;
  const lastAdmin = (user: User) =>
    isLastActiveAdmin(user, adminRoleId, activeAdmins);
  const close = () => setOpen({ kind: 'none' });
  const filtered = q !== '' || roleId !== null || status !== 'all';

  const columns: DataColumn<User>[] = [
    {
      id: 'name',
      header: t('admin.users.name'),
      className: 'w-[34%]',
      cell: (user) => (
        <span className="flex min-w-52 items-center gap-3">
          <UserAvatar
            name={user.name}
            className={cn(
              'size-9 text-xs shadow-none',
              !user.active && 'opacity-50',
            )}
          />
          <span className="grid min-w-0">
            <span className="truncate font-bold" title={user.name}>
              <UserText>{user.name}</UserText>
              {user.id === me?.id && (
                <span className="ms-2 text-xs font-semibold text-muted-foreground">
                  {t('admin.you')}
                </span>
              )}
            </span>
            <bdi
              dir="ltr"
              className="truncate text-xs text-muted-foreground rtl:text-end"
            >
              {user.email}
            </bdi>
          </span>
        </span>
      ),
    },
    {
      id: 'phone',
      header: t('admin.users.phone'),
      className: 'hidden lg:table-cell',
      cell: (user) =>
        user.phone ? (
          <bdi dir="ltr" className="font-numeric tabular-nums">
            {formatPhone(user.phone)}
          </bdi>
        ) : (
          <span className="text-muted-foreground">
            {t('admin.users.noPhone')}
          </span>
        ),
    },
    {
      id: 'role',
      header: t('admin.users.role'),
      cell: (user) => (
        <Badge variant="primary" dot="none">
          {user.role.name}
        </Badge>
      ),
    },
    {
      id: 'status',
      header: t('admin.users.status'),
      cell: (user) => <UserStatusChip active={user.active} />,
    },
    {
      id: 'manage',
      header: '',
      className: 'w-28 text-end',
      cell: (user) => (
        <Button
          variant="ghost"
          size="sm"
          aria-label={t('admin.users.manageUser', { name: user.name })}
          data-active={user.active}
          onClick={() => setOpen({ kind: 'sheet', user })}
        >
          {t('admin.users.manage')}
          <ChevronRight aria-hidden className="size-4 flip-rtl" />
        </Button>
      ),
    },
  ];

  const statusOptions = [
    { value: 'all' as const, label: t('admin.users.statusAll') },
    { value: 'active' as const, label: t('admin.active') },
    { value: 'inactive' as const, label: t('admin.inactive') },
  ];

  const current =
    open.kind === 'none' || open.kind === 'create' ? null : open.user;

  return (
    <div className="grid grid-cols-1 gap-5" data-testid="users-page">
      <PageHeader
        title={t('nav.users')}
        actions={
          <Button
            onClick={() => setOpen({ kind: 'create' })}
            data-testid="add-user"
          >
            <UserPlus aria-hidden />
            {t('admin.users.add')}
          </Button>
        }
      />
      <div className="grid gap-3 md:grid-cols-[1fr_14rem]">
        <SearchField
          label={t('admin.users.searchLabel')}
          placeholder={t('admin.users.searchPlaceholder')}
          value={q}
          maxLength={USER_SEARCH_MAX_LENGTH}
          pending={isPending}
          onSearch={(next) => setParams({ q: next })}
        />
        <Select
          value={roleId ?? ALL_ROLES}
          onValueChange={(next) =>
            setParams({ role: next === ALL_ROLES ? null : next })
          }
        >
          <SelectTrigger
            aria-label={t('admin.users.roleFilter')}
            data-testid="role-filter"
          >
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL_ROLES}>
              {t('admin.users.allRoles')}
            </SelectItem>
            {roles.map((role) => (
              <SelectItem key={role.id} value={role.id}>
                {role.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <FilterChips
          className="md:col-span-2"
          label={t('admin.users.statusFilter')}
          options={statusOptions}
          value={status}
          onChange={(next) =>
            setParams({ status: next === 'all' ? null : next })
          }
        />
      </div>
      <DataList
        label={t('nav.users')}
        columns={columns}
        rows={rows}
        rowKey={(user) => user.id}
        meta={meta}
        isRefetching={isPending}
        renderCard={(user) => (
          <button
            type="button"
            onClick={() => setOpen({ kind: 'sheet', user })}
            aria-label={t('admin.users.manageUser', { name: user.name })}
            data-testid="user-card"
            data-active={user.active}
            className="flex w-full cursor-pointer items-center gap-3 rounded-md bg-card p-4 text-start shadow-raised transition-colors duration-150 hover:bg-accent/60"
          >
            <UserAvatar
              name={user.name}
              className={cn(!user.active && 'opacity-50 shadow-none')}
            />
            <span className="grid min-w-0 flex-1 gap-1">
              <span className="truncate font-bold">
                <UserText>{user.name}</UserText>
              </span>
              <bdi
                dir="ltr"
                className="truncate text-xs text-muted-foreground rtl:text-end"
              >
                {user.email}
              </bdi>
              <span className="flex flex-wrap items-center gap-1.5">
                <Badge variant="primary" dot="none">
                  {user.role.name}
                </Badge>
                <UserStatusChip active={user.active} />
              </span>
            </span>
            <ChevronRight
              aria-hidden
              className="size-5 shrink-0 flip-rtl text-muted-foreground"
            />
          </button>
        )}
        empty={{
          icon: UsersRound,
          title: t('admin.users.emptyTitle'),
          body: filtered ? t('admin.users.emptyBody') : undefined,
        }}
      />

      <UserFormDialog
        mode={{ kind: 'create' }}
        roles={roles}
        open={open.kind === 'create'}
        onOpenChange={(next) => !next && close()}
      />
      {current && (
        <>
          <UserSheet
            user={current}
            isSelf={current.id === me?.id}
            lastAdmin={lastAdmin(current)}
            open={open.kind === 'sheet'}
            onOpenChange={(next) => !next && close()}
            onAction={(action) => setOpen({ kind: action, user: current })}
          />
          <UserFormDialog
            mode={{
              kind: 'edit',
              user: current,
              roleLocked: lastAdmin(current),
            }}
            roles={roles}
            open={open.kind === 'edit'}
            onOpenChange={(next) => !next && close()}
          />
          <ResetPasswordDialog
            user={current}
            open={open.kind === 'reset'}
            onOpenChange={(next) => !next && close()}
          />
          <DeactivateDialog
            user={current}
            open={open.kind === 'deactivate'}
            onOpenChange={(next) => !next && close()}
          />
          <ConfirmDialog
            open={open.kind === 'reactivate'}
            onOpenChange={(next) => !next && close()}
            title={t('admin.users.reactivateTitle', { name: current.name })}
            description={t('admin.users.reactivateBody')}
            confirmLabel={t('admin.users.reactivateConfirm')}
            onConfirm={async () => {
              const res = await callApi(REACTIVATE_USER(current.id), {
                showSuccessToast: true,
                successMessage: t('admin.users.reactivated', {
                  name: current.name,
                }),
              });
              if (!res.success) return false;
              router.refresh();
            }}
          />
        </>
      )}
    </div>
  );
}
