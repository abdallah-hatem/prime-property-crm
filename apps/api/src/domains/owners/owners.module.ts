import { Module, type OnModuleInit } from '@nestjs/common';
import { ActivityModule } from '../activity/activity.module';
import { AssignmentModule } from '../assignment/assignment.module';
import { NotesModule } from '../notes/notes.module';
import { RemindersModule } from '../reminders/reminders.module';
import { TrashModule } from '../trash/trash.module';
import { TrashRestoreRegistry } from '../trash/trash-restore.registry';
import { OwnerRestoreHandler } from './owner-restore.handler';
import { OwnersController } from './owners.controller';
import { OwnersService } from './owners.service';
import { OwnerRepository } from './repositories/owner.repository';

/** Owners (homeowner leads): lists, calling list, CRUD, assignment, notes, timeline. */
@Module({
  imports: [
    ActivityModule,
    AssignmentModule,
    NotesModule,
    RemindersModule,
    TrashModule,
  ],
  controllers: [OwnersController],
  providers: [OwnersService, OwnerRepository, OwnerRestoreHandler],
  exports: [OwnersService],
})
export class OwnersModule implements OnModuleInit {
  constructor(
    private readonly registry: TrashRestoreRegistry,
    private readonly restoreHandler: OwnerRestoreHandler,
  ) {}

  onModuleInit(): void {
    this.registry.register('OWNER', this.restoreHandler);
  }
}
