import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { GetUser } from '../../common/decorators/get-user.decorator';
import { RequirePermission } from '../../common/decorators/require-permission.decorator';
import { PaginationQueryDto } from '../../common/dto/pagination-query.dto';
import type { CurrentUser } from '../../common/interfaces/current-user.interface';
import { ResponseUtil } from '../../common/utils/response.util';
import { CreateNoteDto } from '../notes/dto/create-note.dto';
import { AssignOwnersDto } from './dto/assign-owners.dto';
import { CreateOwnerDto } from './dto/create-owner.dto';
import { OwnerIdsQueryDto, OwnerListQueryDto } from './dto/owner-query.dto';
import { UpdateOwnerDto } from './dto/update-owner.dto';
import { OwnersService } from './owners.service';

const Id = () => Param('id', new ParseUUIDPipe());

@Controller('owners')
export class OwnersController {
  constructor(private readonly owners: OwnersService) {}

  @Get()
  async list(@Query() query: OwnerListQueryDto, @GetUser() user: CurrentUser) {
    return ResponseUtil.paginated(await this.owners.list(query, user));
  }

  @Get('calling-list')
  async callingList(
    @Query() query: PaginationQueryDto,
    @GetUser() user: CurrentUser,
  ) {
    return ResponseUtil.paginated(await this.owners.callingList(query, user));
  }

  @Get('ids')
  @RequirePermission('owners.assign')
  ids(@Query() query: OwnerIdsQueryDto, @GetUser() user: CurrentUser) {
    return this.owners.ids(query, user);
  }

  @Post()
  @RequirePermission('owners.import')
  create(@Body() dto: CreateOwnerDto, @GetUser() user: CurrentUser) {
    return this.owners.create(dto, user);
  }

  @Post('assign')
  @HttpCode(200)
  @RequirePermission('owners.assign')
  assign(@Body() dto: AssignOwnersDto, @GetUser() user: CurrentUser) {
    return this.owners.assign(dto, user);
  }

  @Get(':id')
  get(@Id() id: string, @GetUser() user: CurrentUser) {
    return this.owners.get(id, user);
  }

  @Patch(':id')
  update(
    @Id() id: string,
    @Body() dto: UpdateOwnerDto,
    @GetUser() user: CurrentUser,
  ) {
    return this.owners.update(id, dto, user);
  }

  @Delete(':id')
  @RequirePermission('owners.import')
  async remove(@Id() id: string, @GetUser() user: CurrentUser) {
    await this.owners.remove(id, user);
    return ResponseUtil.success(null, 'Moved to the trash');
  }

  @Get(':id/timeline')
  async timeline(
    @Id() id: string,
    @Query() query: PaginationQueryDto,
    @GetUser() user: CurrentUser,
  ) {
    return ResponseUtil.paginated(await this.owners.timeline(id, query, user));
  }

  @Get(':id/notes')
  async listNotes(
    @Id() id: string,
    @Query() query: PaginationQueryDto,
    @GetUser() user: CurrentUser,
  ) {
    return ResponseUtil.paginated(await this.owners.listNotes(id, query, user));
  }

  @Post(':id/notes')
  addNote(
    @Id() id: string,
    @Body() dto: CreateNoteDto,
    @GetUser() user: CurrentUser,
  ) {
    return this.owners.addNote(id, dto.body, user);
  }
}
