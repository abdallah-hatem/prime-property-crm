import {
  Body,
  Controller,
  Delete,
  Param,
  ParseUUIDPipe,
  Post,
  Put,
} from '@nestjs/common';
import { GetUser } from '../../common/decorators/get-user.decorator';
import type { CurrentUser } from '../../common/interfaces/current-user.interface';
import { ResponseUtil } from '../../common/utils/response.util';
import { RegisterPhotoDto, ReorderPhotosDto } from './dto/photo.dto';
import { PhotosService } from './photos.service';

const Id = (name: string) => Param(name, new ParseUUIDPipe());

/** `/listings/:id/photos`: the listing's member or listings.manageAll. */
@Controller('listings/:id/photos')
export class PhotosController {
  constructor(private readonly photos: PhotosService) {}

  @Post()
  register(
    @Id('id') listingId: string,
    @Body() dto: RegisterPhotoDto,
    @GetUser() user: CurrentUser,
  ) {
    return this.photos.register(listingId, dto, user);
  }

  @Put('order')
  reorder(
    @Id('id') listingId: string,
    @Body() dto: ReorderPhotosDto,
    @GetUser() user: CurrentUser,
  ) {
    return this.photos.reorder(listingId, dto, user);
  }

  @Delete(':photoId')
  async remove(
    @Id('id') listingId: string,
    @Id('photoId') photoId: string,
    @GetUser() user: CurrentUser,
  ) {
    await this.photos.remove(listingId, photoId, user);
    return ResponseUtil.success(null, 'Moved to the trash');
  }
}
