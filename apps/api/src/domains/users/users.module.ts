import { Module } from '@nestjs/common';
import { ActivityModule } from '../activity/activity.module';
import { AuthModule } from '../auth/auth.module';
import { RolesModule } from '../roles/roles.module';
import { LastAdminService } from './last-admin.service';
import { UserRepository } from './repositories/user.repository';
import { UsersController } from './users.controller';
import { UsersService } from './users.service';

/**
 * `/users`. Exports LastAdminService (`assertNotLastActiveAdmin(tx, userId)`) for admin-ops
 * deactivation, and UsersService.
 */
@Module({
  imports: [ActivityModule, AuthModule, RolesModule],
  controllers: [UsersController],
  providers: [UsersService, UserRepository, LastAdminService],
  exports: [UsersService, LastAdminService],
})
export class UsersModule {}
