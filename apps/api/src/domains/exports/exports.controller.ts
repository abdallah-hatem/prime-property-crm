import { Controller, Get, Query, StreamableFile } from '@nestjs/common';
import { EXPORT_CONTENT_TYPE } from '@prime-crm/shared';
import { GetUser } from '../../common/decorators/get-user.decorator';
import { RawResponse } from '../../common/decorators/raw-response.decorator';
import { RequirePermission } from '../../common/decorators/require-permission.decorator';
import type { CurrentUser } from '../../common/interfaces/current-user.interface';
import {
  ListingExportQueryDto,
  OwnerExportQueryDto,
} from './dto/export-query.dto';
import { ExportsService, type ExportFile } from './exports.service';

/** The file itself, not the envelope (spec, Conventions: exceptions to the envelope). */
function download(file: ExportFile): StreamableFile {
  return new StreamableFile(file.content, {
    type: EXPORT_CONTENT_TYPE,
    disposition: `attachment; filename="${file.fileName}"`,
    length: file.content.length,
  });
}

@Controller('exports')
@RequirePermission('data.export')
export class ExportsController {
  constructor(private readonly exports: ExportsService) {}

  @Get('owners')
  @RawResponse()
  async owners(
    @Query() query: OwnerExportQueryDto,
    @GetUser() user: CurrentUser,
  ) {
    return download(await this.exports.exportOwners(query, user));
  }

  @Get('listings')
  @RawResponse()
  async listings(
    @Query() query: ListingExportQueryDto,
    @GetUser() user: CurrentUser,
  ) {
    return download(await this.exports.exportListings(query, user));
  }
}
