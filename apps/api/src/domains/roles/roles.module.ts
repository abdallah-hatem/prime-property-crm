import { Module } from '@nestjs/common';
import { ActivityModule } from '../activity/activity.module';
import { RoleRepository } from './repositories/role.repository';
import { RolesController } from './roles.controller';
import { RolesService } from './roles.service';

/** `/roles`. Exports RolesService so users can check a `roleId` inside their transaction. */
@Module({
  imports: [ActivityModule],
  controllers: [RolesController],
  providers: [RolesService, RoleRepository],
  exports: [RolesService],
})
export class RolesModule {}
