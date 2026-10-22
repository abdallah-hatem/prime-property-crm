import { Global, Module } from '@nestjs/common';
import { Clock } from './providers/clock';
import { RoleLookupRepository } from './repositories/role-lookup.repository';
import { UserDirectoryRepository } from './repositories/user-directory.repository';
import { AdminRoleService } from './services/admin-role.service';

/** Cross-cutting providers every domain may inject: the clock, the Admin role lookup, user lookups. */
@Global()
@Module({
  providers: [
    Clock,
    RoleLookupRepository,
    AdminRoleService,
    UserDirectoryRepository,
  ],
  exports: [Clock, AdminRoleService, UserDirectoryRepository],
})
export class CommonModule {}
