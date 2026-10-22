import { Module } from '@nestjs/common';
import { ActivityModule } from '../activity/activity.module';
import { CallOutcomesController } from './call-outcomes.controller';
import { CallOutcomesService } from './call-outcomes.service';
import { CallOutcomeRepository } from './repositories/call-outcome.repository';

/** The call-outcome list. Exports CallOutcomesService (`find(tx, id)` for setting an outcome). */
@Module({
  imports: [ActivityModule],
  controllers: [CallOutcomesController],
  providers: [CallOutcomesService, CallOutcomeRepository],
  exports: [CallOutcomesService],
})
export class CallOutcomesModule {}
