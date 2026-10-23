'use client';

import Link from 'next/link';
import type {
  ImportCounts as Counts,
  ImportField,
  ImportIssue,
  ImportIssueReason,
  ImportKind,
  ImportStatus,
} from '@prime-crm/shared';
import { Badge } from '@/components/ui/badge';
import { useTranslation } from '@/i18n/i18n-provider';
import type { Translate } from '@/i18n/translate';
import { formatNumber, formatPhone } from '@/lib/format';
import { cn } from '@/lib/utils';

/** Translated names for the import vocabulary (fields, reasons, kinds, statuses). */
export const fieldLabel = (t: Translate, field: string): string =>
  t(`imports.field.${field as ImportField}`);
export const reasonLabel = (t: Translate, reason: ImportIssueReason) =>
  t(`imports.reason.${reason}`);
export const kindLabel = (t: Translate, kind: ImportKind) =>
  t(`imports.kind.${kind}`);

const STATUS_VARIANT = {
  MAPPING: 'neutral',
  PREVIEWED: 'primary',
  DONE: 'success',
  FAILED: 'warning',
} as const;

export function ImportStatusChip({ status }: { status: ImportStatus }) {
  const { t } = useTranslation();
  return (
    <Badge variant={STATUS_VARIANT[status]} data-status={status}>
      {t(`imports.status.${status}`)}
    </Badge>
  );
}

const REASON_VARIANT = {
  DUPLICATE: 'warning',
  INVALID_PHONE: 'neutral',
  MISSING_REQUIRED: 'neutral',
  INVALID_VALUE: 'neutral',
} as const;

export function ReasonChip({ reason }: { reason: ImportIssueReason }) {
  const { t } = useTranslation();
  return (
    <Badge variant={REASON_VARIANT[reason]}>{reasonLabel(t, reason)}</Badge>
  );
}

/**
 * The four numbers of an import: rows in the file, added (or "will be added" before confirm),
 * duplicates and rejected. Numerals in the numeric face, grouped.
 */
export function ImportCountTiles({
  counts,
  done,
  className,
}: {
  counts: Counts;
  /** After confirm: "Added"; before: "Will be added". */
  done: boolean;
  className?: string;
}) {
  const { t } = useTranslation();
  const tiles = [
    { key: 'total', label: t('imports.counts.total'), value: counts.total },
    {
      key: 'added',
      label: done ? t('imports.counts.added') : t('imports.counts.willAdd'),
      value: counts.added,
      tone: 'text-success',
    },
    {
      key: 'duplicates',
      label: t('imports.counts.duplicates'),
      value: counts.duplicates,
      tone: 'text-warning',
    },
    {
      key: 'rejected',
      label: t('imports.counts.rejected'),
      value: counts.rejected,
    },
  ];
  return (
    <dl
      className={cn('grid grid-cols-2 gap-2.5 sm:grid-cols-4', className)}
      data-testid="import-counts"
    >
      {tiles.map((tile) => (
        <div
          key={tile.key}
          data-count={tile.key}
          className="grid gap-1 rounded-md bg-card px-4 py-3.5 shadow-raised"
        >
          <dt className="text-xs font-semibold text-muted-foreground">
            {tile.label}
          </dt>
          <dd
            className={cn(
              'font-numeric text-2xl leading-none font-extrabold tabular-nums',
              tile.tone,
            )}
          >
            {formatNumber(tile.value)}
          </dd>
        </div>
      ))}
    </dl>
  );
}

/** "12 added, 2 duplicates, 1 rejected" for a list row. */
export function countsLine(t: Translate, counts: Counts): string {
  return t('imports.countsLine', {
    added: formatNumber(counts.added),
    duplicates: formatNumber(counts.duplicates),
    rejected: formatNumber(counts.rejected),
  });
}

/** What the issue's row held and, for a duplicate, what already has that phone. */
export function IssueDetail({ issue }: { issue: ImportIssue }) {
  const { t } = useTranslation();
  const where = issue.field ? fieldLabel(t, issue.field) : null;
  const raw = issue.value?.trim();
  // Phones come back normalised (+20…); show them the way the team writes them.
  const value = !raw
    ? t('imports.emptyValue')
    : issue.field?.startsWith('phone') && raw.startsWith('+20')
      ? formatPhone(raw)
      : raw;
  let match: React.ReactNode = null;
  if (issue.reason === 'DUPLICATE') {
    if (issue.inTrash) match = t('imports.matchTrash');
    else if (issue.matches?.ownerId)
      match = (
        <Link
          href={`/owners/${issue.matches.ownerId}`}
          className="font-semibold text-primary underline-offset-4 hover:underline"
        >
          {t('imports.matchOwner')}
        </Link>
      );
    else if (issue.matches?.listingId)
      match = (
        <Link
          href={`/listings/${issue.matches.listingId}`}
          className="font-semibold text-primary underline-offset-4 hover:underline"
        >
          {t('imports.matchListing')}
        </Link>
      );
    else if (issue.matches) match = t('imports.matchHidden');
    else match = t('imports.matchEarlierRow');
  }
  return (
    <span className="grid min-w-0 gap-0.5">
      {where && (
        <span className="truncate">
          {where}:{' '}
          <bdi dir="auto" className="font-numeric">
            {value}
          </bdi>
        </span>
      )}
      {match && <span className="text-xs text-muted-foreground">{match}</span>}
    </span>
  );
}

/** One issue as a card: row number, reason, the value and its match. */
export function IssueCard({ issue }: { issue: ImportIssue }) {
  const { t } = useTranslation();
  return (
    <div
      data-testid="import-issue"
      data-reason={issue.reason}
      className="grid grid-cols-[auto_minmax(0,1fr)] items-start gap-3 rounded-md bg-card px-4 py-3 text-sm shadow-raised"
    >
      <span className="pt-0.5 font-numeric text-xs font-bold whitespace-nowrap text-muted-foreground tabular-nums">
        {t('imports.row', { row: formatNumber(issue.row) })}
      </span>
      <span className="grid min-w-0 gap-1.5">
        <span>
          <ReasonChip reason={issue.reason} />
        </span>
        <IssueDetail issue={issue} />
      </span>
    </div>
  );
}
