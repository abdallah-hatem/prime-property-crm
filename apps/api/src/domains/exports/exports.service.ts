import { BadRequestException, Injectable } from '@nestjs/common';
import {
  EXPORT_MAX_ROWS,
  ExportErrorCode,
  exportFileName,
  type ExportKind,
} from '@prime-crm/shared';
import type { CurrentUser } from '../../common/interfaces/current-user.interface';
import { Clock } from '../../common/providers/clock';
import { UserDirectoryRepository } from '../../common/repositories/user-directory.repository';
import { cairoDateOf } from '../../common/utils/cairo-date.util';
import { DatabaseService } from '../../database/database.service';
import { ActivityService } from '../activity/activity.service';
import { ListingsService } from '../listings/listings.service';
import { OwnersService } from '../owners/owners.service';
import type {
  ListingExportQueryDto,
  OwnerExportQueryDto,
} from './dto/export-query.dto';
import { listingsWorkbook, ownersWorkbook } from './exports.workbook';

/** A finished export: the `.xlsx` bytes and its file name. */
export interface ExportFile {
  fileName: string;
  content: Buffer;
}

function tooLarge(total: number): BadRequestException {
  return new BadRequestException({
    message: `${total} rows match; an export holds at most ${EXPORT_MAX_ROWS}. Narrow the filters.`,
    error: ExportErrorCode.EXPORT_TOO_LARGE,
  });
}

/**
 * Excel exports (data.export) of owners and listings with the list endpoints' filters and
 * scoping. Each export writes one EXPORT activity entry.
 */
@Injectable()
export class ExportsService {
  constructor(
    private readonly db: DatabaseService,
    private readonly owners: OwnersService,
    private readonly listings: ListingsService,
    private readonly users: UserDirectoryRepository,
    private readonly activity: ActivityService,
    private readonly clock: Clock,
  ) {}

  async exportOwners(
    query: OwnerExportQueryDto,
    user: CurrentUser,
  ): Promise<ExportFile> {
    const { total, rows } = await this.owners.exportRows(
      query,
      user,
      EXPORT_MAX_ROWS,
    );
    if (total > EXPORT_MAX_ROWS) throw tooLarge(total);
    const language = await this.users.languageOf(user.id);
    const content = await ownersWorkbook(rows, language);
    return this.finish('owners', rows.length, query, user, content);
  }

  async exportListings(
    query: ListingExportQueryDto,
    user: CurrentUser,
  ): Promise<ExportFile> {
    const { total, rows } = await this.listings.exportRows(
      query,
      user,
      EXPORT_MAX_ROWS,
    );
    if (total > EXPORT_MAX_ROWS) throw tooLarge(total);
    const language = await this.users.languageOf(user.id);
    const content = await listingsWorkbook(rows, language);
    return this.finish('listings', rows.length, query, user, content);
  }

  /** Logs the export (who, what, how many rows, which filters) and names the file. */
  private async finish(
    kind: ExportKind,
    count: number,
    filters: object,
    user: CurrentUser,
    content: Buffer,
  ): Promise<ExportFile> {
    await this.db.transaction((tx) =>
      this.activity.record(tx, {
        type: 'EXPORT',
        actorId: user.id,
        summary: `Exported ${count} ${kind}`,
        details: {
          kind: kind === 'owners' ? 'OWNERS' : 'LISTINGS',
          count,
          filters: JSON.parse(JSON.stringify(filters)) as unknown,
        },
      }),
    );
    return {
      fileName: exportFileName(kind, cairoDateOf(this.clock.now())),
      content,
    };
  }
}
