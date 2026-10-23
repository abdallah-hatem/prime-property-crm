'use client';

import Link from 'next/link';
import { ArrowLeft, CircleCheck } from 'lucide-react';
import {
  ImportIssueReasonSchema,
  type ImportIssue,
  type ImportIssueReason,
  type ImportJob,
  type Meta,
} from '@prime-crm/shared';
import { DataList, type DataColumn } from '@/components/data-list';
import { DateText } from '@/components/date-text';
import { FilterChips } from '@/components/filter-chips';
import {
  ImportCountTiles,
  ImportStatusChip,
  IssueCard,
  IssueDetail,
  kindLabel,
  ReasonChip,
} from '@/components/imports/import-bits';
import { PageHeader } from '@/components/page-header';
import { Button } from '@/components/ui/button';
import { useTranslation } from '@/i18n/i18n-provider';
import { formatNumber } from '@/lib/format';
import { useUrlParams } from '@/lib/use-url-params';

/**
 * One import: what it was, its counts, and every row it didn't add (paginated, filtered by
 * reason in the URL). An unfinished one can be continued in the wizard.
 */
export function ImportDetail({
  job,
  issues,
  meta,
  reason,
}: {
  job: ImportJob;
  issues: ImportIssue[];
  meta: Meta;
  reason: ImportIssueReason | 'ALL';
}) {
  const { t } = useTranslation();
  const { setParams, isPending } = useUrlParams();
  const done = job.status === 'DONE';

  const columns: DataColumn<ImportIssue>[] = [
    {
      id: 'row',
      header: t('imports.rowColumn'),
      className: 'w-20',
      cell: (issue) => (
        <span className="font-numeric font-bold tabular-nums">
          {formatNumber(issue.row)}
        </span>
      ),
    },
    {
      id: 'reason',
      header: t('imports.reasonColumn'),
      className: 'w-40',
      cell: (issue) => <ReasonChip reason={issue.reason} />,
    },
    {
      id: 'detail',
      header: t('imports.detailColumn'),
      cell: (issue) => <IssueDetail issue={issue} />,
    },
  ];

  return (
    <div className="grid grid-cols-1 gap-6">
      <Button variant="ghost" size="sm" className="justify-self-start" asChild>
        <Link href="/imports">
          <ArrowLeft aria-hidden className="flip-rtl" />
          {t('imports.allImports')}
        </Link>
      </Button>
      <PageHeader
        title={job.fileName}
        description={
          <span className="flex flex-wrap items-center gap-2">
            <ImportStatusChip status={job.status} />
            <span className="flex flex-wrap gap-x-3">
              <span>{kindLabel(t, job.kind)}</span>
              <bdi>{job.createdBy.name}</bdi>
              <DateText value={job.createdAt} style="dateTime" />
            </span>
          </span>
        }
        actions={
          done ? (
            job.kind === 'OWNERS' && (
              <Button variant="soft" asChild>
                <Link href={`/owners?importId=${job.id}`}>
                  {t('imports.seeOwners')}
                </Link>
              </Button>
            )
          ) : (
            <Button asChild>
              <Link href={`/imports/new?job=${job.id}`}>
                {t('imports.continue')}
              </Link>
            </Button>
          )
        }
      />
      {job.assignTo && (
        <p className="text-sm text-muted-foreground">
          {t('imports.assignedTo', { name: job.assignTo.name })}
        </p>
      )}
      {job.counts ? (
        <ImportCountTiles counts={job.counts} done={done} />
      ) : (
        <p className="rounded-md bg-card px-4 py-4 text-sm text-muted-foreground shadow-raised">
          {t('imports.notPreviewed')}
        </p>
      )}

      {job.counts && (
        <section
          className="grid grid-cols-1 gap-3"
          aria-labelledby="detail-issues"
        >
          <h2 id="detail-issues" className="type-h2">
            {t('imports.issuesTitle')}
          </h2>
          <FilterChips
            label={t('imports.reasonFilter')}
            value={reason}
            onChange={(next) =>
              setParams({ reason: next === 'ALL' ? null : next })
            }
            options={[
              { value: 'ALL' as const, label: t('owners.all') },
              ...ImportIssueReasonSchema.options.map((value) => ({
                value,
                label: t(`imports.reason.${value}`),
              })),
            ]}
          />
          <DataList
            label={t('imports.issuesTitle')}
            columns={columns}
            rows={issues}
            rowKey={(issue) => `${issue.row}-${issue.reason}-${issue.field}`}
            meta={meta}
            isRefetching={isPending}
            renderCard={(issue) => <IssueCard issue={issue} />}
            empty={{
              icon: CircleCheck,
              title:
                reason === 'ALL'
                  ? t('imports.issuesEmpty')
                  : t('imports.issuesEmptyReason'),
            }}
          />
        </section>
      )}
    </div>
  );
}
