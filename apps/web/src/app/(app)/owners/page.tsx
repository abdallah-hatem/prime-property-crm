import { LeadStatusSchema, PAGE_LIMIT_MAX } from '@prime-crm/shared';
import { GET_OWNERS } from '@/apis';
import { LoadError } from '@/components/load-error';
import { OwnersView } from '@/components/owners/owners-view';
import { getTranslator } from '@/i18n/server';
import { getSession } from '@/lib/session';

const one = (value: string | string[] | undefined): string | undefined =>
  Array.isArray(value) ? value[0] : value;

/** Owners: search and status in the URL; the API scopes the list to the caller. */
export default async function OwnersPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const q = (one(params.q) ?? '').slice(0, 100);
  const statusParam = LeadStatusSchema.safeParse(one(params.status));
  const status = statusParam.success ? statusParam.data : undefined;
  const pageNumber = Number(one(params.page) ?? 1);
  const page = Number.isInteger(pageNumber) && pageNumber > 0 ? pageNumber : 1;

  const [session, res] = await Promise.all([
    getSession(),
    GET_OWNERS({
      q: q || undefined,
      status: status ? [status] : undefined,
      page,
      limit: PAGE_LIMIT_MAX,
    }),
  ]);
  if (!res.success || !res.meta) {
    const t = await getTranslator();
    return <LoadError title={t('owners.title')} message={t('error.generic')} />;
  }
  const viewAll =
    session.status === 'signedIn' &&
    session.me.permissions.includes('owners.viewAll');

  return (
    <OwnersView
      rows={res.data}
      meta={res.meta}
      q={q}
      status={status ?? 'ALL'}
      viewAll={viewAll}
      now={new Date().toISOString()}
    />
  );
}
