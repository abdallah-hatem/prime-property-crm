import type { ImportIssue, ImportJob, ImportMapping } from '@prime-crm/shared';
import type { CurrentUser } from '../../common/interfaces/current-user.interface';
import { hasPermission } from '../../common/utils/permissions.util';
import type {
  ImportIssueRow,
  ImportJobData,
} from './repositories/import.repository';

export function toImportJob(row: ImportJobData): ImportJob {
  return {
    id: row.id,
    kind: row.kind,
    fileName: row.fileName,
    status: row.status,
    headers: row.headers,
    mapping: (row.mapping as ImportMapping | null) ?? null,
    counts:
      row.addedCount === null
        ? null
        : {
            total: row.totalRows,
            added: row.addedCount,
            duplicates: row.duplicateCount ?? 0,
            rejected: row.rejectedCount ?? 0,
          },
    assignTo: row.assignTo,
    totalRows: row.totalRows,
    createdBy: row.createdBy,
    createdAt: row.createdAt.toISOString(),
  };
}

/**
 * An issue as the caller may see it: an owner id only with owners.viewAll (a trashed owner's
 * only with trash.restore), the same rule as `409 PHONE_EXISTS`. Listing ids are not secret:
 * every user can open every listing.
 */
export function toImportIssue(
  row: Omit<ImportIssueRow, 'ownerDeleted'> & { ownerDeleted: boolean },
  user: CurrentUser,
): ImportIssue {
  const showOwner = hasPermission(
    user,
    row.ownerDeleted ? 'trash.restore' : 'owners.viewAll',
  );
  const ownerId = showOwner ? row.matchOwnerId : null;
  const hasMatch = ownerId !== null || row.matchListingId !== null;
  return {
    row: row.rowNumber,
    reason: row.issue,
    field: row.issueField,
    value: row.issueValue,
    matches: hasMatch ? { ownerId, listingId: row.matchListingId } : null,
    inTrash: row.ownerDeleted,
  };
}
