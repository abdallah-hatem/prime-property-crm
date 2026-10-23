import { PAGE_LIMIT_MAX } from '@prime-crm/shared';
import { GET_IMPORTS } from '@/apis';
import { ImportsList } from '@/components/imports/imports-list';
import { LoadError } from '@/components/load-error';
import { getTranslator } from '@/i18n/server';

/** Past imports (the kinds the caller may import), newest first, paginated in the URL. */
export default async function ImportsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const raw = Number(Array.isArray(params.page) ? params.page[0] : params.page);
  const page = Number.isInteger(raw) && raw > 0 ? raw : 1;
  const res = await GET_IMPORTS({ page, limit: PAGE_LIMIT_MAX });
  if (!res.success || !res.meta) {
    const t = await getTranslator();
    return (
      <LoadError title={t('imports.title')} message={t('error.generic')} />
    );
  }
  return <ImportsList jobs={res.data} meta={res.meta} />;
}
