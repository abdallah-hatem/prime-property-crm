import { notFound } from 'next/navigation';
import {
  ImportIssueReasonSchema,
  PAGE_LIMIT_MAX,
  type Meta,
} from '@prime-crm/shared';
import { GET_IMPORT, GET_IMPORT_ISSUES } from '@/apis';
import { ImportDetail } from '@/components/imports/import-detail';
import { LoadError } from '@/components/load-error';
import { getTranslator } from '@/i18n/server';

const EMPTY_META: Meta = {
  total: 0,
  page: 1,
  limit: PAGE_LIMIT_MAX,
  hasNextPage: false,
  hasPreviousPage: false,
};

/** One import with its issues (reason and page in the URL). */
export default async function ImportPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { id } = await params;
  const query = await searchParams;
  const one = (value: string | string[] | undefined) =>
    Array.isArray(value) ? value[0] : value;
  const reasonParam = ImportIssueReasonSchema.safeParse(one(query.reason));
  const reason = reasonParam.success ? reasonParam.data : undefined;
  const raw = Number(one(query.page));
  const page = Number.isInteger(raw) && raw > 0 ? raw : 1;

  const job = await GET_IMPORT(id);
  if (!job.success) {
    if (job.status === 404 || job.status === 400) notFound();
    const t = await getTranslator();
    return (
      <LoadError title={t('imports.title')} message={t('error.generic')} />
    );
  }
  const issues = job.data.counts
    ? await GET_IMPORT_ISSUES(id, { reason, page, limit: PAGE_LIMIT_MAX })
    : null;
  if (issues && !issues.success) {
    const t = await getTranslator();
    return <LoadError title={job.data.fileName} message={t('error.generic')} />;
  }
  return (
    <ImportDetail
      job={job.data}
      issues={issues?.data ?? []}
      meta={issues?.meta ?? EMPTY_META}
      reason={reason ?? 'ALL'}
    />
  );
}
