import { Module } from '@nestjs/common';
import { CallOutcomesModule } from '../call-outcomes/call-outcomes.module';
import { RemindersModule } from '../reminders/reminders.module';
import { CallsController } from './calls.controller';
import { CallsService } from './calls.service';
import { CallRepository } from './repositories/call.repository';

/** Calls: start, set the outcome, list. Exports CallsService (`today` for `/me/today`). */
@Module({
  imports: [CallOutcomesModule, RemindersModule],
  controllers: [CallsController],
  providers: [CallsService, CallRepository],
  exports: [CallsService],
})
export class CallsModule {}
