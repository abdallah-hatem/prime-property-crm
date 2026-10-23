import { notFound } from 'next/navigation';
import type { ImportJob, ImportKind } from '@prime-crm/shared';
import { GET_IMPORT } from '@/apis';
import { ImportWizard } from '@/components/imports/import-wizard';
import { getSession } from '@/lib/session';

/**
 * The import wizard. Kinds by permission (owners.import → owners, listings.create → listings);
 * `?job=<id>` continues an unfinished import at the columns step.
 */
export default async function NewImportPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const session = await getSession();
  const permissions =
    session.status === 'signedIn' ? session.me.permissions : [];
  const kinds: ImportKind[] = [
    ...(permissions.includes('owners.import') ? (['OWNERS'] as const) : []),
    ...(permissions.includes('listings.create') ? (['LISTINGS'] as const) : []),
  ];
  if (kinds.length === 0) notFound();

  const jobId = Array.isArray(params.job) ? params.job[0] : params.job;
  let resume: ImportJob | undefined;
  if (jobId) {
    const res = await GET_IMPORT(jobId);
    if (
      res.success &&
      res.data.status !== 'DONE' &&
      kinds.includes(res.data.kind)
    )
      resume = res.data;
  }

  return (
    <ImportWizard
      // A fresh wizard per job (or none), so state never leaks between them.
      key={resume?.id ?? 'new'}
      kinds={kinds}
      canAssign={permissions.includes('owners.assign')}
      resume={resume}
    />
  );
}
