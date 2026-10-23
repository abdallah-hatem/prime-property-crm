import { TrashKindSchema } from '@prime-crm/shared';
import { GET_TRASH } from '@/apis';
import { TrashView } from '@/components/admin/trash/trash-view';
import { LoadError } from '@/components/load-error';
import { getTranslator } from '@/i18n/server';

const one = (value: string | string[] | undefined): string | undefined =>
  Array.isArray(value) ? value[0] : value;

/** Trash (trash.restore): kind in the URL, restore per item. */
export default async function TrashPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const kindParam = TrashKindSchema.safeParse(one(params.kind));
  const kind = kindParam.success ? kindParam.data : undefined;
  const pageNumber = Number(one(params.page) ?? 1);
  const page = Number.isInteger(pageNumber) && pageNumber > 0 ? pageNumber : 1;

  const res = await GET_TRASH({ kind, page });
  if (!res.success || !res.meta) {
    const t = await getTranslator();
    return <LoadError title={t('nav.trash')} message={t('error.generic')} />;
  }
  return (
    <TrashView
      rows={res.data}
      meta={res.meta}
      kind={kind ?? 'ALL'}
      now={new Date().toISOString()}
    />
  );
}
