import {
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { GetUser } from '../../common/decorators/get-user.decorator';
import type { CurrentUser } from '../../common/interfaces/current-user.interface';
import { ResponseUtil } from '../../common/utils/response.util';
import {
  ImportIssuesQueryDto,
  ImportListQueryDto,
  PreviewImportDto,
  UploadImportDto,
} from './dto/import.dto';
import { ImportFileErrors, ImportFileUpload } from './import-file.interceptor';
import { ImportsService, type UploadedImportFile } from './imports.service';

const Id = () => Param('id', new ParseUUIDPipe());

/**
 * Imports of owners (owners.import) and listings (listings.create). The permission depends on
 * the import's kind, so the service checks it.
 */
@Controller('imports')
export class ImportsController {
  constructor(private readonly imports: ImportsService) {}

  @Post()
  @UseInterceptors(ImportFileErrors, ImportFileUpload)
  upload(
    @UploadedFile() file: UploadedImportFile | undefined,
    @Body() dto: UploadImportDto,
    @GetUser() user: CurrentUser,
  ) {
    return this.imports.upload(file, dto, user);
  }

  @Get()
  async list(@Query() query: ImportListQueryDto, @GetUser() user: CurrentUser) {
    return ResponseUtil.paginated(await this.imports.list(query, user));
  }

  @Get(':id')
  get(@Id() id: string, @GetUser() user: CurrentUser) {
    return this.imports.get(id, user);
  }

  @Post(':id/preview')
  @HttpCode(200)
  preview(
    @Id() id: string,
    @Body() dto: PreviewImportDto,
    @GetUser() user: CurrentUser,
  ) {
    return this.imports.preview(id, dto, user);
  }

  @Post(':id/confirm')
  @HttpCode(200)
  confirm(@Id() id: string, @GetUser() user: CurrentUser) {
    return this.imports.confirm(id, user);
  }

  @Get(':id/issues')
  async issues(
    @Id() id: string,
    @Query() query: ImportIssuesQueryDto,
    @GetUser() user: CurrentUser,
  ) {
    return ResponseUtil.paginated(await this.imports.issues(id, query, user));
  }
}
