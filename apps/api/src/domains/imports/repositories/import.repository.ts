import { Injectable } from '@nestjs/common';
import type {
  Prisma,
  ImportIssueReason,
  ImportKind,
  ImportStatus,
} from '@prisma/client';
import type { Tx } from '../../../common/interfaces/transaction.interface';
import { DatabaseService } from '../../../database/database.service';
import type { Cells, OwnerPhoneHit, PhoneLookup } from '../imports.pure';

/**
 * Bulk import transactions: Prisma's 5 s default is too short for 20 000 rows. The timeout
 * stays under Vercel's function limit so a stuck import fails (and rolls back) first.
 */
export const IMPORT_TX_OPTIONS = { timeout: 55_000, maxWait: 15_000 };

/** Rows per INSERT: well under Postgres's 65 535 bind parameters for every table here. */
export const INSERT_CHUNK = 1000;

const chunks = <T>(items: T[], size = INSERT_CHUNK): T[][] =>
  Array.from({ length: Math.ceil(items.length / size) }, (_, i) =>
    items.slice(i * size, (i + 1) * size),
  );

/** The columns behind `ImportJob`. */
export const IMPORT_JOB_SELECT = {
  id: true,
  kind: true,
  fileName: true,
  status: true,
  headers: true,
  mapping: true,
  totalRows: true,
  addedCount: true,
  duplicateCount: true,
  rejectedCount: true,
  createdById: true,
  createdAt: true,
  assignToId: true,
  createdBy: { select: { id: true, name: true } },
  assignTo: { select: { id: true, name: true } },
} as const satisfies Prisma.ImportJobSelect;

export type ImportJobData = Prisma.ImportJobGetPayload<{
  select: typeof IMPORT_JOB_SELECT;
}>;

export interface RowIssueWrite {
  rowNumber: number;
  issue: ImportIssueReason;
  field: string | null;
  value: string | null;
  ownerId: string | null;
  listingId: string | null;
  /** Not stored: read back from the owner's deletedAt. */
  inTrash: boolean;
}

export interface ImportIssueRow {
  rowNumber: number;
  issue: ImportIssueReason;
  issueField: string | null;
  issueValue: string | null;
  matchOwnerId: string | null;
  matchListingId: string | null;
  ownerDeleted: boolean;
}

export interface NewOwner {
  id: string;
  name: string;
  area: string | null;
  phones: string[];
  note: string | null;
}

export type NewListing = Omit<
  Prisma.ListingCreateManyInput,
  'createdById' | 'sourceImportId' | 'assignedToId'
>;

@Injectable()
export class ImportRepository {
  constructor(private readonly db: DatabaseService) {}

  // ---------------------------------------------------------------- jobs

  /** The job and its staged rows, written together. */
  createJob(
    data: {
      kind: ImportKind;
      fileName: string;
      headers: string[];
      mapping: Record<string, string>;
      createdById: string;
    },
    rows: { rowNumber: number; cells: Cells }[],
  ): Promise<ImportJobData> {
    return this.db.transaction(async (tx) => {
      const job = await tx.importJob.create({
        data: { ...data, totalRows: rows.length },
        select: { id: true },
      });
      for (const part of chunks(rows)) {
        await tx.importRow.createMany({
          data: part.map((r) => ({
            jobId: job.id,
            rowNumber: r.rowNumber,
            data: r.cells,
          })),
        });
      }
      return tx.importJob.findUniqueOrThrow({
        where: { id: job.id },
        select: IMPORT_JOB_SELECT,
      });
    }, IMPORT_TX_OPTIONS);
  }

  findJob(id: string, tx?: Tx): Promise<ImportJobData | null> {
    return (tx ?? this.db).importJob.findUnique({
      where: { id },
      select: IMPORT_JOB_SELECT,
    });
  }

  /** Locks the job row for the transaction (two confirms run one after the other). */
  async lockJob(tx: Tx, id: string): Promise<ImportJobData | null> {
    await tx.$queryRaw`SELECT id FROM import_jobs WHERE id = ${id}::uuid FOR UPDATE`;
    return this.findJob(id, tx);
  }

  async listJobs(
    kinds: ImportKind[],
    skip: number,
    take: number,
  ): Promise<{ rows: ImportJobData[]; total: number }> {
    const where = { kind: { in: kinds } };
    const [rows, total] = await Promise.all([
      this.db.importJob.findMany({
        where,
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        skip,
        take,
        select: IMPORT_JOB_SELECT,
      }),
      this.db.importJob.count({ where }),
    ]);
    return { rows, total };
  }

  async updateJob(
    id: string,
    data: {
      status?: ImportStatus;
      mapping?: Record<string, string>;
      assignToId?: string | null;
      counts?: { added: number; duplicates: number; rejected: number } | null;
      error?: string | null;
    },
    tx?: Tx,
  ): Promise<void> {
    const { counts, ...rest } = data;
    await (tx ?? this.db).importJob.update({
      where: { id },
      data: {
        ...rest,
        ...(counts !== undefined && {
          addedCount: counts?.added ?? null,
          duplicateCount: counts?.duplicates ?? null,
          rejectedCount: counts?.rejected ?? null,
        }),
      },
      select: { id: true },
    });
  }

  // ---------------------------------------------------------------- rows

  async loadRows(
    jobId: string,
    tx?: Tx,
  ): Promise<{ rowNumber: number; cells: Cells }[]> {
    const rows = await (tx ?? this.db).importRow.findMany({
      where: { jobId },
      orderBy: { rowNumber: 'asc' },
      select: { rowNumber: true, data: true },
    });
    return rows.map((r) => ({
      rowNumber: r.rowNumber,
      cells: (r.data as unknown[]).map((c) => String(c ?? '')),
    }));
  }

  /** Replaces the job's row issues with `issues` (one UPDATE over unnest arrays). */
  async writeIssues(
    jobId: string,
    issues: RowIssueWrite[],
    tx?: Tx,
  ): Promise<void> {
    const client = tx ?? this.db;
    await client.$executeRaw`
      UPDATE import_rows
         SET issue = NULL, issue_field = NULL, issue_value = NULL,
             match_owner_id = NULL, match_listing_id = NULL
       WHERE job_id = ${jobId}::uuid AND issue IS NOT NULL`;
    for (const part of chunks(issues, 5000)) {
      await client.$executeRaw`
        UPDATE import_rows r
           SET issue = v.issue::import_issue_reason,
               issue_field = v.field,
               issue_value = v.value,
               match_owner_id = v.owner_id::uuid,
               match_listing_id = v.listing_id::uuid
          FROM unnest(
                 ${part.map((i) => i.rowNumber)}::int[],
                 ${part.map((i) => i.issue)}::text[],
                 ${part.map((i) => i.field)}::text[],
                 ${part.map((i) => i.value)}::text[],
                 ${part.map((i) => i.ownerId)}::text[],
                 ${part.map((i) => i.listingId)}::text[]
               ) AS v(row_number, issue, field, value, owner_id, listing_id)
         WHERE r.job_id = ${jobId}::uuid AND r.row_number = v.row_number`;
    }
  }

  async issuesPage(
    jobId: string,
    reason: ImportIssueReason | undefined,
    skip: number,
    take: number,
  ): Promise<{ rows: ImportIssueRow[]; total: number }> {
    const where: Prisma.ImportRowWhereInput = reason
      ? { jobId, issue: reason }
      : { jobId, issue: { not: null } };
    const [rows, total] = await Promise.all([
      this.db.importRow.findMany({
        where,
        orderBy: { rowNumber: 'asc' },
        skip,
        take,
        select: {
          rowNumber: true,
          issue: true,
          issueField: true,
          issueValue: true,
          matchOwnerId: true,
          matchListingId: true,
        },
      }),
      this.db.importRow.count({ where }),
    ]);
    const ownerIds = rows
      .map((r) => r.matchOwnerId)
      .filter((id): id is string => id !== null);
    const deleted = new Set(
      ownerIds.length
        ? (
            await this.db.owner.findMany({
              where: { id: { in: ownerIds }, deletedAt: { not: null } },
              select: { id: true },
            })
          ).map((o) => o.id)
        : [],
    );
    return {
      rows: rows.map((r) => ({
        ...r,
        issue: r.issue as ImportIssueReason,
        ownerDeleted: r.matchOwnerId !== null && deleted.has(r.matchOwnerId),
      })),
      total,
    };
  }

  // ---------------------------------------------------------------- duplicates

  /**
   * Who holds any of these E.164 phones: owners (any slot, trashed included, with their live
   * listing) and live listings. One query each, the phones passed as one array parameter.
   */
  async phoneLookup(phones: string[], tx?: Tx): Promise<PhoneLookup> {
    const client = tx ?? this.db;
    const owners = new Map<string, OwnerPhoneHit>();
    const listings = new Map<string, string>();
    if (phones.length === 0) return { owners, listings };

    const ownerRows = await client.$queryRaw<
      {
        phone: string;
        owner_id: string;
        deleted: boolean;
        assigned_to_id: string | null;
        listing_id: string | null;
      }[]
    >`
      SELECT p.phone, o.id::text AS owner_id, o.deleted_at IS NOT NULL AS deleted,
             o.assigned_to_id::text AS assigned_to_id, l.id::text AS listing_id
        FROM owner_phones p
        JOIN owners o ON o.id = p.owner_id
        LEFT JOIN listings l ON l.owner_id = o.id AND l.deleted_at IS NULL
       WHERE p.phone = ANY(${phones}::text[])`;
    for (const r of ownerRows) {
      owners.set(r.phone, {
        ownerId: r.owner_id,
        deleted: r.deleted,
        assignedToId: r.assigned_to_id,
        listingId: r.listing_id,
      });
    }
    const listingRows = await client.$queryRaw<
      { id: string; owner_phone: string }[]
    >`
      SELECT id::text AS id, owner_phone FROM listings
       WHERE deleted_at IS NULL AND owner_phone = ANY(${phones}::text[])`;
    for (const r of listingRows) listings.set(r.owner_phone, r.id);
    return { owners, listings };
  }

  // ---------------------------------------------------------------- inserts

  /**
   * New owners with their phones and notes, batched. With an assignee, each owner gets its
   * OwnerAssignment row (unassigned → assignee) for the timeline.
   */
  async insertOwners(
    tx: Tx,
    owners: NewOwner[],
    meta: { jobId: string; actorId: string; assignToId: string | null },
  ): Promise<void> {
    for (const part of chunks(owners)) {
      await tx.owner.createMany({
        data: part.map((o) => ({
          id: o.id,
          name: o.name,
          area: o.area,
          assignedToId: meta.assignToId,
          sourceImportId: meta.jobId,
          createdById: meta.actorId,
        })),
      });
      await tx.ownerPhone.createMany({
        data: part.flatMap((o) =>
          o.phones.map((phone, position) => ({
            ownerId: o.id,
            phone,
            position,
          })),
        ),
      });
      const notes = part.filter((o) => o.note);
      if (notes.length) {
        await tx.note.createMany({
          data: notes.map((o) => ({
            ownerId: o.id,
            authorId: meta.actorId,
            body: o.note as string,
          })),
        });
      }
      if (meta.assignToId) {
        await tx.ownerAssignment.createMany({
          data: part.map((o) => ({
            ownerId: o.id,
            fromMemberId: null,
            toMemberId: meta.assignToId,
            byId: meta.actorId,
          })),
        });
      }
    }
  }

  async insertListings(
    tx: Tx,
    listings: NewListing[],
    meta: { jobId: string; actorId: string; assignToId: string },
  ): Promise<void> {
    for (const part of chunks(listings)) {
      await tx.listing.createMany({
        data: part.map((l) => ({
          ...l,
          assignedToId: meta.assignToId,
          sourceImportId: meta.jobId,
          createdById: meta.actorId,
        })),
      });
    }
  }

  /** Linked owner leads become Listed. */
  async markOwnersListed(tx: Tx, ownerIds: string[]): Promise<void> {
    for (const part of chunks(ownerIds)) {
      await tx.owner.updateMany({
        where: { id: { in: part }, deletedAt: null },
        data: { status: 'LISTED' },
      });
    }
  }
}

export { chunks };
