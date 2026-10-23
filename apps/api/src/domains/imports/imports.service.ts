import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  HttpException,
  Injectable,
  InternalServerErrorException,
  Logger,
} from '@nestjs/common';
import {
  ErrorCode,
  IMPORT_PREVIEW_ISSUES,
  IMPORT_SAMPLE_SIZE,
  ImportErrorCode,
  type ImportCounts,
  type ImportIssue,
  type ImportJob,
  type ImportKind,
  type ImportPreview,
} from '@prime-crm/shared';
import { randomUUID } from 'node:crypto';
import type { Paginated } from '../../common/interfaces/api-response.interface';
import type { CurrentUser } from '../../common/interfaces/current-user.interface';
import type { Tx } from '../../common/interfaces/transaction.interface';
import type { UserSummary } from '../../common/interfaces/user-summary.interface';
import { UserDirectoryRepository } from '../../common/repositories/user-directory.repository';
import { notFound } from '../../common/utils/ownership.util';
import { pageWindow, toPage } from '../../common/utils/pagination.util';
import { hasPermission } from '../../common/utils/permissions.util';
import { DatabaseService } from '../../database/database.service';
import { ActivityService } from '../activity/activity.service';
import { assignActivity } from '../assignment/assign-activity';
import { AssignmentService } from '../assignment/assignment.service';
import type {
  ImportIssuesQueryDto,
  ImportListQueryDto,
  PreviewImportDto,
  UploadImportDto,
} from './dto/import.dto';
import { parseImportFile } from './import-file.parser';
import { toImportIssue, toImportJob } from './import.shape';
import {
  checkRows,
  classifyRows,
  columnsOf,
  countsOf,
  mappedRow,
  mappingProblem,
  phonesOf,
  suggestMapping,
  type Classified,
  type ListingCandidate,
  type OwnerCandidate,
  type StagedRow,
} from './imports.pure';
import {
  chunks,
  IMPORT_TX_OPTIONS,
  ImportRepository,
  type ImportJobData,
  type RowIssueWrite,
} from './repositories/import.repository';

/** The permission that imports each kind. */
const KIND_PERMISSION = {
  OWNERS: 'owners.import',
  LISTINGS: 'listings.create',
} as const;

const FILE_NAME_MAX = 255;

/** The uploaded file as multer hands it over (memory storage). */
export interface UploadedImportFile {
  originalname: string;
  buffer: Buffer;
}

type Mapped = Classified<OwnerCandidate | ListingCandidate>;

const conflict = (error: ImportErrorCode, message: string) =>
  new ConflictException({ message, error });

/**
 * Multer reads multipart file names as Latin-1; a UTF-8 name (Arabic) comes back intact when
 * re-read as UTF-8.
 */
export function fileNameOf(raw: string): string {
  const utf8 = Buffer.from(raw, 'latin1').toString('utf8');
  const name = utf8.includes('�') ? raw : utf8;
  return name.trim().slice(0, FILE_NAME_MAX) || 'import';
}

/**
 * Imports of owners and listings: upload (parsed and staged in import_rows), preview with a
 * mapping (issues stored per row), confirm (one transaction: all rows or none). Duplicates are
 * phones held by an owner (any slot, trashed included), a live listing, or an earlier row.
 */
@Injectable()
export class ImportsService {
  private readonly logger = new Logger(ImportsService.name);

  constructor(
    private readonly db: DatabaseService,
    private readonly imports: ImportRepository,
    private readonly assignment: AssignmentService,
    private readonly activity: ActivityService,
    private readonly users: UserDirectoryRepository,
  ) {}

  // ------------------------------------------------------------------ access

  private assertCanImport(kind: ImportKind, user: CurrentUser): void {
    if (!hasPermission(user, KIND_PERMISSION[kind])) {
      throw new ForbiddenException({
        message: `Importing ${kind.toLowerCase()} needs ${KIND_PERMISSION[kind]}`,
        error: ErrorCode.FORBIDDEN,
      });
    }
  }

  /** The caller's own import (anyone else's is a 404), still importable by them. */
  private async ownJob(id: string, user: CurrentUser): Promise<ImportJobData> {
    const job = await this.imports.findJob(id);
    if (!job || job.createdById !== user.id) throw notFound('Import');
    this.assertCanImport(job.kind, user);
    return job;
  }

  // ------------------------------------------------------------------ upload

  async upload(
    file: UploadedImportFile | undefined,
    dto: UploadImportDto,
    user: CurrentUser,
  ): Promise<ImportJob> {
    this.assertCanImport(dto.kind, user);
    if (!file) {
      throw new BadRequestException({
        message: 'Attach the file as the multipart part "file"',
        error: ErrorCode.VALIDATION_FAILED,
      });
    }
    const { headers, rows } = await parseImportFile(
      file.originalname,
      file.buffer,
    );
    const job = await this.imports.createJob(
      {
        kind: dto.kind,
        fileName: fileNameOf(file.originalname),
        headers,
        mapping: suggestMapping(dto.kind, headers),
        createdById: user.id,
      },
      rows,
    );
    return toImportJob(job);
  }

  // ------------------------------------------------------------------ preview

  /**
   * Checks every row against the database (inside `tx`) and stores each row's issue. Returns
   * the rows' verdicts and the first rows for the preview sample.
   */
  private async evaluate(
    tx: Tx,
    job: ImportJobData,
  ): Promise<{
    classified: Mapped[];
    issues: RowIssueWrite[];
    head: StagedRow[];
  }> {
    const mapping = job.mapping as Record<string, string>;
    const rows = await this.imports.loadRows(job.id, tx);
    const checked = checkRows(job.kind, rows, columnsOf(mapping, job.headers));
    const lookup = await this.imports.phoneLookup(phonesOf(checked), tx);
    const classified = classifyRows(job.kind, checked, lookup);
    const issues = classified.flatMap(({ rowNumber, issue }) =>
      issue
        ? [
            {
              rowNumber,
              issue: issue.reason,
              field: issue.field,
              value: issue.value,
              ownerId: issue.ownerId,
              listingId: issue.listingId,
              inTrash: issue.inTrash,
            },
          ]
        : [],
    );
    await this.imports.writeIssues(job.id, issues, tx);
    return { classified, issues, head: rows.slice(0, IMPORT_SAMPLE_SIZE) };
  }

  async preview(
    id: string,
    dto: PreviewImportDto,
    user: CurrentUser,
  ): Promise<ImportPreview> {
    await this.ownJob(id, user);
    if (dto.assignTo && !hasPermission(user, 'owners.assign')) {
      throw new ForbiddenException({
        message: 'Assigning the imported rows needs owners.assign',
        error: ErrorCode.FORBIDDEN,
      });
    }

    const { job, issues, head } = await this.db.transaction(async (tx) => {
      const locked = (await this.imports.lockJob(tx, id)) as ImportJobData;
      if (locked.status === 'DONE') {
        throw conflict(
          ImportErrorCode.IMPORT_NOT_EDITABLE,
          'This import is already done',
        );
      }
      const problem = mappingProblem(locked.kind, dto.mapping, locked.headers);
      if (problem) {
        throw new BadRequestException({
          message:
            problem.code === 'MAPPING_INCOMPLETE'
              ? `Map a column to: ${problem.missing.join(', ')}`
              : `The mapping has an ${problem.detail}`,
          error: ImportErrorCode[problem.code],
        });
      }
      await this.assignment.assertAssignee(tx, dto.assignTo ?? null);

      const result = await this.evaluate(tx, {
        ...locked,
        mapping: dto.mapping,
      });
      await this.imports.updateJob(
        id,
        {
          status: 'PREVIEWED',
          mapping: dto.mapping,
          assignToId: dto.assignTo ?? null,
          counts: countsOf(result.classified),
          error: null,
        },
        tx,
      );
      return {
        ...result,
        job: (await this.imports.findJob(id, tx)) as ImportJobData,
      };
    }, IMPORT_TX_OPTIONS);

    const columns = columnsOf(dto.mapping, job.headers);
    return {
      job: toImportJob(job),
      sample: head.map((r) => ({
        row: r.rowNumber,
        ...mappedRow(r.cells, columns),
      })),
      issues: issues.slice(0, IMPORT_PREVIEW_ISSUES).map((i) =>
        toImportIssue(
          {
            rowNumber: i.rowNumber,
            issue: i.issue,
            issueField: i.field,
            issueValue: i.value,
            matchOwnerId: i.ownerId,
            matchListingId: i.listingId,
            ownerDeleted: i.inTrash,
          },
          user,
        ),
      ),
    };
  }

  // ------------------------------------------------------------------ confirm

  private async addOwners(
    tx: Tx,
    job: ImportJobData,
    rows: Mapped[],
    assignee: UserSummary | null,
    user: CurrentUser,
  ): Promise<void> {
    const owners = rows.flatMap((r) => {
      const o = r.value as OwnerCandidate | null;
      return o ? [{ id: randomUUID(), ...o }] : [];
    });
    if (owners.length === 0) return;
    await this.imports.insertOwners(tx, owners, {
      jobId: job.id,
      actorId: user.id,
      assignToId: assignee?.id ?? null,
    });
    if (assignee) {
      await this.activity.record(
        tx,
        assignActivity(user.id, {
          kind: 'OWNERS',
          count: owners.length,
          assignee,
        }),
      );
    }
  }

  /**
   * New listings go to the chosen member (else the importer). A listing whose phone is an
   * owner lead's links to it: the lead becomes Listed and moves (with its open reminders) to
   * the listing's member, as with `POST /listings`. With `assignTo`: one ASSIGN entry for the
   * listings (and the leads that moved with them), linked or not. Without it the listings are
   * the importer's own, so the entry, if any, is for the leads that moved to the importer.
   */
  private async addListings(
    tx: Tx,
    job: ImportJobData,
    rows: Mapped[],
    assignee: UserSummary | null,
    user: CurrentUser,
  ): Promise<void> {
    const memberId = assignee?.id ?? user.id;
    const listings = rows.flatMap((r) => {
      const l = r.value as ListingCandidate | null;
      return l
        ? [
            {
              id: randomUUID(),
              ...l,
              ownerId: r.link?.ownerId ?? null,
              link: r.link,
            },
          ]
        : [];
    });
    if (listings.length === 0) return;
    await this.imports.insertListings(
      tx,
      listings.map(({ link: _link, ...l }) => l),
      { jobId: job.id, actorId: user.id, assignToId: memberId },
    );

    const linked = listings.filter((l) => l.link);
    await this.imports.markOwnersListed(
      tx,
      linked.map((l) => l.link!.ownerId),
    );
    const moving = linked.filter((l) => l.link!.assignedToId !== memberId);
    for (const part of chunks(moving)) {
      await this.assignment.reassignOwnerAndListing(
        tx,
        { listingIds: part.map((l) => l.id) },
        memberId,
        user.id,
      );
    }
    if (assignee) {
      await this.activity.record(
        tx,
        assignActivity(user.id, {
          kind: 'LISTINGS',
          count: listings.length,
          assignee,
          linkedOwners: moving.length,
        }),
      );
    } else if (moving.length) {
      const to = await this.users.findActive(user.id, tx);
      if (to) {
        await this.activity.record(
          tx,
          assignActivity(user.id, {
            kind: 'OWNERS',
            count: moving.length,
            assignee: to,
          }),
        );
      }
    }
  }

  private assertConfirmable(job: ImportJobData): void {
    if (job.status === 'DONE') {
      throw conflict(
        ImportErrorCode.IMPORT_ALREADY_DONE,
        'This import is already done',
      );
    }
    if (job.status !== 'PREVIEWED') {
      throw conflict(
        ImportErrorCode.IMPORT_NOT_PREVIEWED,
        'Preview the import before confirming it',
      );
    }
  }

  /**
   * Re-checks every row (owners may have been added since the preview) and adds the rest in
   * one transaction: a failure saves nothing and marks the job FAILED (it can be previewed and
   * confirmed again). One IMPORT activity entry with the counts.
   */
  async confirm(id: string, user: CurrentUser): Promise<ImportJob> {
    const job = await this.ownJob(id, user);
    this.assertConfirmable(job);
    if (job.assignToId && !hasPermission(user, 'owners.assign')) {
      throw new ForbiddenException({
        message: 'Assigning the imported rows needs owners.assign',
        error: ErrorCode.FORBIDDEN,
      });
    }

    try {
      await this.db.transaction(async (tx) => {
        const locked = (await this.imports.lockJob(tx, id)) as ImportJobData;
        this.assertConfirmable(locked);
        const assignee = await this.assignment.assertAssignee(
          tx,
          locked.assignToId,
        );
        const { classified: rows } = await this.evaluate(tx, locked);
        const counts = countsOf(rows);
        if (locked.kind === 'OWNERS') {
          await this.addOwners(tx, locked, rows, assignee, user);
        } else {
          await this.addListings(tx, locked, rows, assignee, user);
        }
        await this.recordImport(tx, locked, counts, user);
        await this.imports.updateJob(
          id,
          { status: 'DONE', counts, error: null },
          tx,
        );
      }, IMPORT_TX_OPTIONS);
    } catch (error) {
      if (error instanceof HttpException) throw error;
      const reason = error instanceof Error ? error.message : String(error);
      this.logger.error(`Import ${id} failed: ${reason}`);
      await this.imports.updateJob(id, {
        status: 'FAILED',
        error: reason.slice(0, 1000),
      });
      throw new InternalServerErrorException({
        message: 'The import failed and nothing was saved',
        error: ImportErrorCode.IMPORT_FAILED,
      });
    }
    return toImportJob((await this.imports.findJob(id)) as ImportJobData);
  }

  private async recordImport(
    tx: Tx,
    job: ImportJobData,
    counts: ImportCounts,
    user: CurrentUser,
  ): Promise<void> {
    const noun = job.kind === 'OWNERS' ? 'owner' : 'listing';
    await this.activity.record(tx, {
      type: 'IMPORT',
      actorId: user.id,
      summary: `Imported ${counts.added} ${noun}${counts.added === 1 ? '' : 's'} from ${job.fileName} (${counts.duplicates} duplicate, ${counts.rejected} rejected)`,
      target: { kind: 'IMPORT', id: job.id, label: job.fileName },
      details: { kind: job.kind, counts, assignToId: job.assignToId },
    });
  }

  // ------------------------------------------------------------------ lists

  /** Imports of the kinds the caller may import, newest first. */
  async list(
    query: ImportListQueryDto,
    user: CurrentUser,
  ): Promise<Paginated<ImportJob>> {
    const allowed = (['OWNERS', 'LISTINGS'] as const).filter((k) =>
      hasPermission(user, KIND_PERMISSION[k]),
    );
    const kinds = query.kind
      ? allowed.filter((k) => k === query.kind)
      : allowed;
    if (kinds.length === 0) {
      throw new ForbiddenException({
        message: 'Imports need owners.import or listings.create',
        error: ErrorCode.FORBIDDEN,
      });
    }
    const window = pageWindow(query.page, query.limit);
    const { rows, total } = await this.imports.listJobs(
      kinds,
      window.skip,
      window.take,
    );
    return toPage(rows.map(toImportJob), total, window);
  }

  /** The rows an import won't add: for its creator, or anyone with owners.import. */
  async issues(
    id: string,
    query: ImportIssuesQueryDto,
    user: CurrentUser,
  ): Promise<Paginated<ImportIssue>> {
    const job = await this.imports.findJob(id);
    if (
      !job ||
      (job.createdById !== user.id && !hasPermission(user, 'owners.import'))
    ) {
      throw notFound('Import');
    }
    const window = pageWindow(query.page, query.limit);
    const { rows, total } = await this.imports.issuesPage(
      id,
      query.reason,
      window.skip,
      window.take,
    );
    return toPage(
      rows.map((r) => toImportIssue(r, user)),
      total,
      window,
    );
  }
}
