import { Global, Module } from '@nestjs/common';
import { Clock } from './providers/clock';
import { RoleLookupRepository } from './repositories/role-lookup.repository';
import { SettingsRepository } from './repositories/settings.repository';
import { UserDirectoryRepository } from './repositories/user-directory.repository';
import { AdminRoleService } from './services/admin-role.service';

/** Cross-cutting providers every domain may inject: the clock, the Admin role lookup, user lookups,
 * settings reads. */
@Global()
@Module({
  providers: [
    Clock,
    RoleLookupRepository,
    AdminRoleService,
    UserDirectoryRepository,
    SettingsRepository,
  ],
  exports: [
    Clock,
    AdminRoleService,
    UserDirectoryRepository,
    SettingsRepository,
  ],
})
export class CommonModule {}
