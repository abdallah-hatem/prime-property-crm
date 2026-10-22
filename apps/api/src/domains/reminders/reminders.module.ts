import { Module } from '@nestjs/common';
import { ReminderRepository } from './repositories/reminder.repository';
import { RemindersController } from './reminders.controller';
import { RemindersService } from './reminders.service';

/**
 * Import it and inject RemindersService to move (`moveOpenReminders`) or close
 * (`closeOpenReminders`) reminders inside your transaction.
 */
@Module({
  controllers: [RemindersController],
  providers: [RemindersService, ReminderRepository],
  exports: [RemindersService],
})
export class RemindersModule {}
