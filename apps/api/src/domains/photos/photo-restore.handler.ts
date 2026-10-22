import { Injectable } from '@nestjs/common';
import type { Tx } from '../../common/interfaces/transaction.interface';
import type {
  RestoreHandler,
  TrashedRecord,
} from '../trash/interfaces/trash.interface';
import { PhotosService } from './photos.service';

/** PHOTO restore rules for the trash core (registered by PhotosModule). */
@Injectable()
export class PhotoRestoreHandler implements RestoreHandler {
  constructor(private readonly photos: PhotosService) {}

  validate(tx: Tx, item: TrashedRecord): Promise<void> {
    return this.photos.validateRestore(tx, item.id);
  }

  afterRestore(tx: Tx, item: TrashedRecord): Promise<void> {
    return this.photos.afterRestore(tx, item.id);
  }
}
