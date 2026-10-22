import { Injectable } from '@nestjs/common';
import { BuiltInRole } from '@prime-crm/shared';
import { RoleLookupRepository } from '../repositories/role-lookup.repository';

/**
 * The id of the built-in Admin role, looked up once per process. The role can't be deleted,
 * so its id never changes; a miss (no Admin role seeded yet) is not cached.
 */
@Injectable()
export class AdminRoleService {
  private adminRoleId: string | null = null;

  constructor(private readonly roles: RoleLookupRepository) {}

  async adminId(): Promise<string | null> {
    if (this.adminRoleId === null) {
      this.adminRoleId = await this.roles.findIdByBuiltIn(BuiltInRole.ADMIN);
    }
    return this.adminRoleId;
  }
}
