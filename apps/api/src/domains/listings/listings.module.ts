import { Module, type OnModuleInit } from '@nestjs/common';
import { ActivityModule } from '../activity/activity.module';
import { AssignmentModule } from '../assignment/assignment.module';
import { NotesModule } from '../notes/notes.module';
import { RemindersModule } from '../reminders/reminders.module';
import { TrashModule } from '../trash/trash.module';
import { TrashRestoreRegistry } from '../trash/trash-restore.registry';
import { ListingRestoreHandler } from './listing-restore.handler';
import { ListingsController } from './listings.controller';
import { ListingsService } from './listings.service';
import { ListingRepository } from './repositories/listing.repository';

/**
 * Listings: search, create (from an owner or direct), edit, status, the Property Finder ad and
 * its check-ins, assignment, delete, notes. Exports ListingsService for photos and uploads
 * (`lockManageable`, `assertManageable`).
 */
@Module({
  imports: [
    ActivityModule,
    AssignmentModule,
    NotesModule,
    RemindersModule,
    TrashModule,
  ],
  controllers: [ListingsController],
  providers: [ListingsService, ListingRepository, ListingRestoreHandler],
  exports: [ListingsService],
})
export class ListingsModule implements OnModuleInit {
  constructor(
    private readonly registry: TrashRestoreRegistry,
    private readonly restoreHandler: ListingRestoreHandler,
  ) {}

  onModuleInit(): void {
    this.registry.register('LISTING', this.restoreHandler);
  }
}
