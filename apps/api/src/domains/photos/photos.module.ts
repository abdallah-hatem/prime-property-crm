import { Module, type OnModuleInit } from '@nestjs/common';
import { ListingsModule } from '../listings/listings.module';
import { TrashModule } from '../trash/trash.module';
import { TrashRestoreRegistry } from '../trash/trash-restore.registry';
import { UploadsModule } from '../uploads/uploads.module';
import { PhotoRestoreHandler } from './photo-restore.handler';
import { PhotosController } from './photos.controller';
import { PhotosService } from './photos.service';
import { PhotoRepository } from './repositories/photo.repository';

/** Listing photos: register an uploaded file, reorder, delete; PHOTO restore rules. */
@Module({
  imports: [ListingsModule, TrashModule, UploadsModule],
  controllers: [PhotosController],
  providers: [PhotosService, PhotoRepository, PhotoRestoreHandler],
  exports: [PhotosService],
})
export class PhotosModule implements OnModuleInit {
  constructor(
    private readonly registry: TrashRestoreRegistry,
    private readonly restoreHandler: PhotoRestoreHandler,
  ) {}

  onModuleInit(): void {
    this.registry.register('PHOTO', this.restoreHandler);
  }
}
