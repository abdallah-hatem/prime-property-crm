'use client';

import { useState } from 'react';
import { CircleCheck } from 'lucide-react';
import {
  IMPORT_PREVIEW_ISSUES,
  ImportIssueReasonSchema,
  importFieldsOf,
  type ImportIssueReason,
  type ImportPreview as Preview,
} from '@prime-crm/shared';
import { FilterChips } from '@/components/filter-chips';
import {
  fieldLabel,
  ImportCountTiles,
  IssueCard,
  ReasonChip,
  reasonLabel,
} from '@/components/imports/import-bits';
import { useTranslation } from '@/i18n/i18n-provider';
import { formatNumber } from '@/lib/format';

type ReasonFilter = ImportIssueReason | 'ALL';

const cellText = (value: unknown): string =>
  value === null || value === undefined
    ? ''
    : typeof value === 'object'
      ? JSON.stringify(value)
      : String(value);

/**
 * What confirm would do: the counts, the first mapped rows as a table that scrolls inside its
 * card, and the rows that won't be added with their reasons (filterable by reason).
 */
export function ImportPreview({ preview }: { preview: Preview }) {
  const { t } = useTranslation();
  const [reason, setReason] = useState<ReasonFilter>('ALL');
  const { job, sample, issues } = preview;
  const mapped = importFieldsOf(job.kind).filter(
    (field) => job.mapping?.[field],
  );
  const present = ImportIssueReasonSchema.options.filter((value) =>
    issues.some((issue) => issue.reason === value),
  );
  const shown =
    reason === 'ALL'
      ? issues
      : issues.filter((issue) => issue.reason === reason);
  const issueByRow = new Map(issues.map((issue) => [issue.row, issue]));
  const issueTotal =
    (job.counts?.duplicates ?? 0) + (job.counts?.rejected ?? 0);

  return (
    <div className="grid grid-cols-1 gap-6">
      {job.counts && <ImportCountTiles counts={job.counts} done={false} />}

      <section
        className="grid grid-cols-1 gap-3"
        aria-labelledby="sample-heading"
      >
        <h2 id="sample-heading" className="type-h2">
          {t('imports.sampleTitle')}
        </h2>
        {sample.length === 0 ? (
          <p className="rounded-md bg-card px-4 py-6 text-center text-sm text-muted-foreground shadow-raised">
            {t('imports.sampleEmpty')}
          </p>
        ) : (
          <div className="min-w-0 rounded-lg bg-card py-2 shadow-raised">
            <div className="mx-1.5 scrollbar-clean max-h-96 overflow-auto overscroll-contain">
              <table
                className="w-max min-w-full border-collapse text-sm"
                data-testid="sample-table"
              >
                <thead className="sticky top-0 bg-card">
                  <tr>
                    <th
                      scope="col"
                      className="px-3 py-2.5 text-start text-xs font-semibold whitespace-nowrap text-muted-foreground"
                    >
                      {t('imports.rowColumn')}
                    </th>
                    {mapped.map((field) => (
                      <th
                        key={field}
                        scope="col"
                        className="px-3 py-2.5 text-start text-xs font-semibold whitespace-nowrap text-muted-foreground"
                      >
                        {fieldLabel(t, field)}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {sample.map((row, index) => {
                    const rowNumber = Number(row.row ?? index + 1);
                    const issue = issueByRow.get(rowNumber);
                    return (
                      <tr key={index} className="border-t border-border">
                        <td className="px-3 py-3 whitespace-nowrap">
                          <span className="flex items-center gap-2">
                            <span className="font-numeric font-bold text-muted-foreground tabular-nums">
                              {formatNumber(rowNumber)}
                            </span>
                            {issue && <ReasonChip reason={issue.reason} />}
                          </span>
                        </td>
                        {mapped.map((field) => (
                          <td
                            key={field}
                            className="max-w-60 truncate px-3 py-3 whitespace-nowrap"
                          >
                            <bdi dir="auto">{cellText(row[field])}</bdi>
                          </td>
                        ))}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </section>

      <section
        className="grid grid-cols-1 gap-3"
        aria-labelledby="issues-heading"
      >
        <h2 id="issues-heading" className="type-h2">
          {t('imports.issuesTitle')}
        </h2>
        {issues.length === 0 ? (
          <p
            className="flex items-center justify-center gap-2 rounded-md bg-card px-4 py-6 text-sm font-semibold text-success shadow-raised"
            data-testid="issues-empty"
          >
            <CircleCheck aria-hidden className="size-4" />
            {t('imports.issuesEmpty')}
          </p>
        ) : (
          <>
            <FilterChips
              label={t('imports.reasonFilter')}
              value={reason}
              onChange={setReason}
              options={[
                { value: 'ALL', label: t('owners.all') },
                ...present.map((value) => ({
                  value,
                  label: `${reasonLabel(t, value)} (${formatNumber(
                    issues.filter((issue) => issue.reason === value).length,
                  )})`,
                })),
              ]}
            />
            <ul className="grid gap-2" data-testid="preview-issues">
              {shown.map((issue) => (
                <li key={`${issue.row}-${issue.reason}-${issue.field}`}>
                  <IssueCard issue={issue} />
                </li>
              ))}
            </ul>
            {issues.length >= IMPORT_PREVIEW_ISSUES &&
              issueTotal > issues.length && (
                <p className="text-xs text-muted-foreground">
                  {t('imports.issuesMore', {
                    count: formatNumber(issues.length),
                    total: formatNumber(issueTotal),
                  })}
                </p>
              )}
          </>
        )}
      </section>
    </div>
  );
}
