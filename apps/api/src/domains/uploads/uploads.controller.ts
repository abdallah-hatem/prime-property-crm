import { Body, Controller, HttpCode, Post, Req } from '@nestjs/common';
import type { Request } from 'express';
import { GetUser } from '../../common/decorators/get-user.decorator';
import { RawResponse } from '../../common/decorators/raw-response.decorator';
import type { CurrentUser } from '../../common/interfaces/current-user.interface';
import { ListingPhotoUploadDto } from './dto/listing-photo-upload.dto';
import { UploadsService } from './uploads.service';

@Controller('uploads')
export class UploadsController {
  constructor(private readonly uploads: UploadsService) {}

  /**
   * The Vercel Blob client-upload handshake (`upload(..., { handleUploadUrl })` on the web,
   * with the Authorization header). Answers the Blob protocol as is, not the envelope.
   */
  @Post('listing-photo')
  @HttpCode(200)
  @RawResponse()
  listingPhoto(
    @Body() dto: ListingPhotoUploadDto,
    @Req() request: Request,
    @GetUser() user: CurrentUser,
  ) {
    return this.uploads.listingPhotoToken(dto, request, user);
  }
}
