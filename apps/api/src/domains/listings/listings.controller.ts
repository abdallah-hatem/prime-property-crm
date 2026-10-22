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
  Put,
  Query,
} from '@nestjs/common';
import { GetUser } from '../../common/decorators/get-user.decorator';
import { RequirePermission } from '../../common/decorators/require-permission.decorator';
import { PaginationQueryDto } from '../../common/dto/pagination-query.dto';
import type { CurrentUser } from '../../common/interfaces/current-user.interface';
import { ResponseUtil } from '../../common/utils/response.util';
import { CreateNoteDto } from '../notes/dto/create-note.dto';
import { CreateListingDto } from './dto/create-listing.dto';
import {
  AdCheckInDto,
  AssignListingsDto,
  ListingStatusDto,
  UpdateAdDto,
} from './dto/listing-actions.dto';
import { ListingListQueryDto } from './dto/listing-query.dto';
import { UpdateListingDto } from './dto/update-listing.dto';
import { ListingsService } from './listings.service';

const Id = () => Param('id', new ParseUUIDPipe());

@Controller('listings')
export class ListingsController {
  constructor(private readonly listings: ListingsService) {}

  @Get()
  async list(
    @Query() query: ListingListQueryDto,
    @GetUser() user: CurrentUser,
  ) {
    return ResponseUtil.paginated(await this.listings.list(query, user));
  }

  @Post()
  create(@Body() dto: CreateListingDto, @GetUser() user: CurrentUser) {
    return this.listings.create(dto, user);
  }

  @Post('assign')
  @HttpCode(200)
  @RequirePermission('owners.assign')
  assign(@Body() dto: AssignListingsDto, @GetUser() user: CurrentUser) {
    return this.listings.assign(dto, user);
  }

  @Get(':id')
  get(@Id() id: string, @GetUser() user: CurrentUser) {
    return this.listings.get(id, user);
  }

  @Patch(':id')
  update(
    @Id() id: string,
    @Body() dto: UpdateListingDto,
    @GetUser() user: CurrentUser,
  ) {
    return this.listings.update(id, dto, user);
  }

  @Post(':id/status')
  @HttpCode(200)
  setStatus(
    @Id() id: string,
    @Body() dto: ListingStatusDto,
    @GetUser() user: CurrentUser,
  ) {
    return this.listings.setStatus(id, dto.status, user);
  }

  @Put(':id/ad')
  updateAd(
    @Id() id: string,
    @Body() dto: UpdateAdDto,
    @GetUser() user: CurrentUser,
  ) {
    return this.listings.updateAd(id, dto, user);
  }

  @Post(':id/ad/check-in')
  @HttpCode(200)
  checkIn(
    @Id() id: string,
    @Body() dto: AdCheckInDto,
    @GetUser() user: CurrentUser,
  ) {
    return this.listings.checkIn(id, dto, user);
  }

  @Delete(':id')
  @RequirePermission('listings.manageAll')
  async remove(@Id() id: string, @GetUser() user: CurrentUser) {
    await this.listings.remove(id, user);
    return ResponseUtil.success(null, 'Moved to the trash');
  }

  @Get(':id/notes')
  async listNotes(@Id() id: string, @Query() query: PaginationQueryDto) {
    return ResponseUtil.paginated(await this.listings.listNotes(id, query));
  }

  @Post(':id/notes')
  addNote(
    @Id() id: string,
    @Body() dto: CreateNoteDto,
    @GetUser() user: CurrentUser,
  ) {
    return this.listings.addNote(id, dto.body, user);
  }
}
