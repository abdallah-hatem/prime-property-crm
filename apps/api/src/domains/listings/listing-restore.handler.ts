import { Injectable } from '@nestjs/common';
import type { CurrentUser } from '../../common/interfaces/current-user.interface';
import type { Tx } from '../../common/interfaces/transaction.interface';
import type {
  RestoreHandler,
  TrashedRecord,
} from '../trash/interfaces/trash.interface';
import { ListingsService } from './listings.service';

/** LISTING restore rules for the trash core (registered by ListingsModule). */
@Injectable()
export class ListingRestoreHandler implements RestoreHandler {
  constructor(private readonly listings: ListingsService) {}

  validate(tx: Tx, item: TrashedRecord): Promise<void> {
    return this.listings.validateRestore(tx, item.id);
  }

  afterRestore(tx: Tx, item: TrashedRecord, actor: CurrentUser): Promise<void> {
    return this.listings.afterRestore(tx, item.id, actor.id);
  }
}
