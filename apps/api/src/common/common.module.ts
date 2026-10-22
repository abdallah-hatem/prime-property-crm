import { Global, Module } from '@nestjs/common';
import { Clock } from './providers/clock';
import { RoleLookupRepository } from './repositories/role-lookup.repository';
import { AdminRoleService } from './services/admin-role.service';

/** Cross-cutting providers every domain may inject: the clock and the Admin role lookup. */
@Global()
@Module({
  providers: [Clock, RoleLookupRepository, AdminRoleService],
  exports: [Clock, AdminRoleService],
})
export class CommonModule {}
