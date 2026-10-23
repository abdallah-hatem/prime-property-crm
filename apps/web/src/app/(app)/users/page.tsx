import { z } from 'zod';
import { COUNT_ACTIVE_USERS_IN_ROLE, GET_ROLES, GET_USERS } from '@/apis';
import { adminRoleOf } from '@/components/admin/users/user-rules';
import {
  UsersView,
  type UserStatusFilter,
} from '@/components/admin/users/users-view';
import { LoadError } from '@/components/load-error';
import { getTranslator } from '@/i18n/server';

const one = (value: string | string[] | undefined): string | undefined =>
  Array.isArray(value) ? value[0] : value;

const STATUSES: readonly UserStatusFilter[] = ['all', 'active', 'inactive'];

/** Users (users.manage): search, role and status in the URL. */
export default async function UsersPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const q = (one(params.q) ?? '').slice(0, 100);
  const roleParam = z.uuid().safeParse(one(params.role));
  const roleId = roleParam.success ? roleParam.data : null;
  const statusParam = one(params.status) as UserStatusFilter | undefined;
  const status =
    statusParam && STATUSES.includes(statusParam) ? statusParam : 'all';
  const pageNumber = Number(one(params.page) ?? 1);
  const page = Number.isInteger(pageNumber) && pageNumber > 0 ? pageNumber : 1;

  const [res, rolesRes] = await Promise.all([
    GET_USERS({
      q: q || undefined,
      roleId: roleId ?? undefined,
      active: status === 'all' ? undefined : status === 'active',
      page,
    }),
    GET_ROLES(),
  ]);
  if (!res.success || !res.meta || !rolesRes.success) {
    const t = await getTranslator();
    return <LoadError title={t('nav.users')} message={t('error.generic')} />;
  }
  const adminRole = adminRoleOf(rolesRes.data);
  const admins = adminRole
    ? await COUNT_ACTIVE_USERS_IN_ROLE(adminRole.id)
    : null;

  return (
    <UsersView
      rows={res.data}
      meta={res.meta}
      q={q}
      roleId={roleId}
      status={status}
      roles={rolesRes.data}
      activeAdmins={admins?.success ? admins.data : null}
    />
  );
}
