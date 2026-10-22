import { Module } from '@nestjs/common';
import { RemindersModule } from '../reminders/reminders.module';
import { AssignmentService } from './assignment.service';
import { AssignmentRepository } from './repositories/assignment.repository';

/**
 * Import it and inject AssignmentService (`assertAssignee`, `reassignOwnerAndListing`) to
 * assign owners or listings, or to hand over a deactivated member's work.
 */
@Module({
  imports: [RemindersModule],
  providers: [AssignmentService, AssignmentRepository],
  exports: [AssignmentService],
})
export class AssignmentModule {}
