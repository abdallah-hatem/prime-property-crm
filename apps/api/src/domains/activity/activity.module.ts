import { Module } from '@nestjs/common';
import { ActivityEntryRepository } from '../../common/repositories/activity-entry.repository';
import { ActivityController } from './activity.controller';
import { ActivityService } from './activity.service';

/** Import this module and inject ActivityService to write the log (`record(tx, entry)`). */
@Module({
  controllers: [ActivityController],
  providers: [ActivityService, ActivityEntryRepository],
  exports: [ActivityService],
})
export class ActivityModule {}
