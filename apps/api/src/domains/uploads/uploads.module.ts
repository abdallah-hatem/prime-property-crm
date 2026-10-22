import { Module } from '@nestjs/common';
import { ListingsModule } from '../listings/listings.module';
import { BlobConfig } from './blob.config';
import { BlobUploadGateway } from './blob-upload.gateway';
import { UploadsController } from './uploads.controller';
import { UploadsService } from './uploads.service';

/**
 * Vercel Blob: the client-upload handshake for listing photos, and the Blob settings
 * (BlobConfig) photo registration checks URLs against.
 */
@Module({
  imports: [ListingsModule],
  controllers: [UploadsController],
  providers: [UploadsService, BlobConfig, BlobUploadGateway],
  exports: [BlobConfig],
})
export class UploadsModule {}
