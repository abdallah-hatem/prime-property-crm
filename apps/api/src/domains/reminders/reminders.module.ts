import { Module } from '@nestjs/common';
import { ReminderRepository } from './repositories/reminder.repository';
import { RemindersController } from './reminders.controller';
import { RemindersService } from './reminders.service';

/**
 * Reminders: list, create, edit, done. Other domains import it and inject RemindersService to
 * move (`moveOpenReminders`) or close (`closeOpenReminders`, optionally only some kinds) a
 * record's reminders, or add an ad task (`addListingTask`), inside their transaction.
 */
@Module({
  controllers: [RemindersController],
  providers: [RemindersService, ReminderRepository],
  exports: [RemindersService],
})
export class RemindersModule {}
