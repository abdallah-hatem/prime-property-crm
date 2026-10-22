import { Module } from '@nestjs/common';
import { ActivityModule } from '../activity/activity.module';
import { TrashRepository } from './repositories/trash.repository';
import { TrashRestoreRegistry } from './trash-restore.registry';
import { TrashController } from './trash.controller';
import { TrashService } from './trash.service';

/**
 * Import this module to soft-delete (`TrashService.softDelete(tx, kind, id, actorId)`) and to
 * register restore rules (`TrashRestoreRegistry.register(kind, handler)`).
 */
@Module({
  imports: [ActivityModule],
  controllers: [TrashController],
  providers: [TrashService, TrashRepository, TrashRestoreRegistry],
  exports: [TrashService, TrashRestoreRegistry],
})
export class TrashModule {}
