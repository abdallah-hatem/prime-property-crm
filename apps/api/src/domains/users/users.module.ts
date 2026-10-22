import { Module } from '@nestjs/common';
import { ActivityModule } from '../activity/activity.module';
import { AssignmentModule } from '../assignment/assignment.module';
import { AuthModule } from '../auth/auth.module';
import { RolesModule } from '../roles/roles.module';
import { LastAdminService } from './last-admin.service';
import { UserStatusRepository } from './repositories/user-status.repository';
import { UserRepository } from './repositories/user.repository';
import { UserStatusController } from './user-status.controller';
import { UserStatusService } from './user-status.service';
import { UsersController } from './users.controller';
import { UsersService } from './users.service';

/**
 * `/users`, including deactivate (with hand-over) and reactivate (UserStatusService). Exports
 * LastAdminService (`assertNotLastActiveAdmin(tx, userId)`) and UsersService.
 */
@Module({
  imports: [ActivityModule, AssignmentModule, AuthModule, RolesModule],
  controllers: [UsersController, UserStatusController],
  providers: [
    UsersService,
    UserRepository,
    LastAdminService,
    UserStatusService,
    UserStatusRepository,
  ],
  exports: [UsersService, LastAdminService],
})
export class UsersModule {}
