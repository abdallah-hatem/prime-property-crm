import { Module } from '@nestjs/common';
import { ActivityModule } from '../activity/activity.module';
import { AssignmentModule } from '../assignment/assignment.module';
import { ImportsController } from './imports.controller';
import { ImportsService } from './imports.service';
import { ImportRepository } from './repositories/import.repository';

/** Owner and listing imports: upload, preview, confirm, history and issues. */
@Module({
  imports: [ActivityModule, AssignmentModule],
  controllers: [ImportsController],
  providers: [ImportsService, ImportRepository],
})
export class ImportsModule {}
