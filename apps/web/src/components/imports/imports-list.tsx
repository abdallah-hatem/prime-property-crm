'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { FileSpreadsheet, FileUp } from 'lucide-react';
import type { ImportJob, Meta } from '@prime-crm/shared';
import { DataList, type DataColumn } from '@/components/data-list';
import { DateText } from '@/components/date-text';
import {
  countsLine,
  ImportStatusChip,
  kindLabel,
} from '@/components/imports/import-bits';
import { PageHeader } from '@/components/page-header';
import { Button } from '@/components/ui/button';
import { useTranslation } from '@/i18n/i18n-provider';
import { useUrlParams } from '@/lib/use-url-params';

/** Past imports, newest first: file, kind, status, what each added, who and when. */
export function ImportsList({ jobs, meta }: { jobs: ImportJob[]; meta: Meta }) {
  const { t } = useTranslation();
  const router = useRouter();
  const { isPending } = useUrlParams();
  const href = (job: ImportJob) => `/imports/${job.id}`;

  const columns: DataColumn<ImportJob>[] = [
    {
      id: 'file',
      header: t('imports.file'),
      className: 'min-w-48',
      cell: (job) => (
        <Link
          href={href(job)}
          title={job.fileName}
          className="block truncate font-bold hover:text-primary"
          onClick={(event) => event.stopPropagation()}
        >
          <bdi>{job.fileName}</bdi>
        </Link>
      ),
    },
    {
      id: 'kind',
      header: t('imports.kindColumn'),
      cell: (job) => kindLabel(t, job.kind),
    },
    {
      id: 'status',
      header: t('imports.statusColumn'),
      cell: (job) => <ImportStatusChip status={job.status} />,
    },
    {
      id: 'result',
      header: t('imports.result'),
      cell: (job) =>
        job.counts ? (
          <span className="font-numeric tabular-nums">
            {countsLine(t, job.counts)}
          </span>
        ) : (
          <span className="text-muted-foreground">{t('imports.noCounts')}</span>
        ),
    },
    {
      id: 'by',
      header: t('imports.by'),
      cell: (job) => <bdi>{job.createdBy.name}</bdi>,
    },
    {
      id: 'date',
      header: t('imports.date'),
      cell: (job) => <DateText value={job.createdAt} style="dateTime" />,
    },
  ];

  return (
    <div className="grid grid-cols-1 gap-5">
      <PageHeader
        title={t('imports.title')}
        actions={
          <Button asChild>
            <Link href="/imports/new" data-testid="new-import">
              <FileUp aria-hidden />
              {t('imports.newImport')}
            </Link>
          </Button>
        }
      />
      <DataList
        className="grid-cols-1"
        label={t('imports.title')}
        columns={columns}
        rows={jobs}
        rowKey={(job) => job.id}
        meta={meta}
        isRefetching={isPending}
        onRowClick={(job) => router.push(href(job))}
        renderCard={(job) => (
          <Link
            href={href(job)}
            className="grid gap-2 rounded-md bg-card px-4 py-3.5 shadow-raised outline-none focus-visible:outline-3 focus-visible:outline-ring"
            data-testid="import-card"
          >
            <span className="flex min-w-0 items-center justify-between gap-3">
              <span className="truncate font-bold">
                <bdi>{job.fileName}</bdi>
              </span>
              <ImportStatusChip status={job.status} />
            </span>
            <span className="flex flex-wrap gap-x-3 text-[13px] text-muted-foreground">
              <span>{kindLabel(t, job.kind)}</span>
              <bdi>{job.createdBy.name}</bdi>
              <DateText value={job.createdAt} />
            </span>
            {job.counts && (
              <span className="font-numeric text-sm font-semibold tabular-nums">
                {countsLine(t, job.counts)}
              </span>
            )}
          </Link>
        )}
        empty={{
          icon: FileSpreadsheet,
          title: t('imports.emptyTitle'),
          body: t('imports.emptyBody'),
          action: (
            <Button variant="soft" asChild>
              <Link href="/imports/new">{t('imports.newImport')}</Link>
            </Button>
          ),
        }}
      />
    </div>
  );
}
