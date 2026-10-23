import {
  LeadStatusSchema,
  PAGE_LIMIT_MAX,
  PICKER_LIMIT_MAX,
} from '@prime-crm/shared';
import {
  GET_ASSIGNEE_OPTIONS,
  GET_IMPORTS,
  GET_OWNERS,
  LOOKUP_LISTING_AREAS,
} from '@/apis';
import { LoadError } from '@/components/load-error';
import { AdminOwnersView } from '@/components/owners-admin/admin-owners-view';
import {
  ownerQueryOf,
  parseOwnerFilters,
} from '@/components/owners-admin/owner-filters';
import { OwnersView } from '@/components/owners/owners-view';
import { getTranslator } from '@/i18n/server';
import { getSession } from '@/lib/session';

type Params = Record<string, string | string[] | undefined>;

const one = (value: string | string[] | undefined): string | undefined =>
  Array.isArray(value) ? value[0] : value;

const pageOf = (params: Params): number => {
  const n = Number(one(params.page) ?? 1);
  return Number.isInteger(n) && n > 0 ? n : 1;
};

/**
 * Owners. Whoever sees all owners or assigns them gets the admin table (T15: every filter, select
 * and assign); a member gets their own owners (T13). The API scopes both to the caller.
 */
export default async function OwnersPage({
  searchParams,
}: {
  searchParams: Promise<Params>;
}) {
  const params = await searchParams;
  const session = await getSession();
  const permissions =
    session.status === 'signedIn' ? session.me.permissions : [];
  const viewAll = permissions.includes('owners.viewAll');
  const canAssign = permissions.includes('owners.assign');

  if (viewAll || canAssign) return <AdminOwners params={params} />;

  const q = (one(params.q) ?? '').slice(0, 100);
  const statusParam = LeadStatusSchema.safeParse(one(params.status));
  const status = statusParam.success ? statusParam.data : undefined;
  const res = await GET_OWNERS({
    q: q || undefined,
    status: status ? [status] : undefined,
    page: pageOf(params),
    limit: PAGE_LIMIT_MAX,
  });
  if (!res.success || !res.meta) {
    const t = await getTranslator();
    return <LoadError title={t('owners.title')} message={t('error.generic')} />;
  }
  return (
    <OwnersView
      rows={res.data}
      meta={res.meta}
      q={q}
      status={status ?? 'ALL'}
      viewAll={false}
      now={new Date().toISOString()}
    />
  );
}

async function AdminOwners({ params }: { params: Params }) {
  const session = await getSession();
  const permissions =
    session.status === 'signedIn' ? session.me.permissions : [];
  const canAssign = permissions.includes('owners.assign');
  const canImport = permissions.includes('owners.import');
  const canPickMembers = canAssign || permissions.includes('users.manage');
  const filters = parseOwnerFilters(params);

  const [res, members, areas, imports] = await Promise.all([
    GET_OWNERS({
      ...ownerQueryOf(filters),
      page: pageOf(params),
      limit: PAGE_LIMIT_MAX,
    }),
    canPickMembers ? GET_ASSIGNEE_OPTIONS() : null,
    LOOKUP_LISTING_AREAS({ limit: PICKER_LIMIT_MAX }),
    canImport ? GET_IMPORTS({ kind: 'OWNERS', limit: PAGE_LIMIT_MAX }) : null,
  ]);
  if (!res.success || !res.meta) {
    const t = await getTranslator();
    return <LoadError title={t('owners.title')} message={t('error.generic')} />;
  }

  return (
    <AdminOwnersView
      rows={res.data}
      meta={res.meta}
      filters={filters}
      members={members?.success ? members.data : []}
      areas={areas.success ? areas.data.map((option) => option.area) : []}
      imports={
        imports?.success
          ? imports.data
              .filter((job) => job.status === 'DONE')
              .map((job) => ({ value: job.id, label: job.fileName }))
          : []
      }
      canAssign={canAssign}
      canImport={canImport}
      now={new Date().toISOString()}
    />
  );
}
