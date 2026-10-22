import { Injectable } from '@nestjs/common';
import type { CurrentUser } from '../../common/interfaces/current-user.interface';
import type { Tx } from '../../common/interfaces/transaction.interface';
import type {
  RestoreHandler,
  TrashedRecord,
} from '../trash/interfaces/trash.interface';
import { OwnersService } from './owners.service';

/** OWNER restore rules for the trash core (registered by OwnersModule). */
@Injectable()
export class OwnerRestoreHandler implements RestoreHandler {
  constructor(private readonly owners: OwnersService) {}

  afterRestore(tx: Tx, item: TrashedRecord, actor: CurrentUser): Promise<void> {
    return this.owners.afterRestore(tx, item.id, actor.id);
  }
}
