import { ConflictException, Injectable } from '@nestjs/common';
import { UserErrorCode } from '@prime-crm/shared';
import type { Tx } from '../../common/interfaces/transaction.interface';
import { AdminRoleService } from '../../common/services/admin-role.service';
import { UserRepository } from './repositories/user.repository';

/**
 * The invariant "there is always at least one active admin" (business doc, Invariants).
 * Exported by UsersModule: every change that could take a user off the Admin role or out of
 * the active users (a role change here, deactivation in admin-ops) calls it inside its own
 * transaction, before writing.
 */
@Injectable()
export class LastAdminService {
  constructor(
    private readonly users: UserRepository,
    private readonly adminRole: AdminRoleService,
  ) {}

  /**
   * Throws 409 LAST_ADMIN when `userId` is an active admin and no other active admin exists.
   * Race-safe: it first takes the Admin role's row lock (held until `tx` ends), so two admins
   * demoting or deactivating each other at once run one after the other and the second sees
   * the first's change. Call it before the write, with the same `tx`.
   */
  async assertNotLastActiveAdmin(tx: Tx, userId: string): Promise<void> {
    const adminRoleId = await this.adminRole.adminId();
    if (adminRoleId === null) return;
    await this.users.lockAdminRole(adminRoleId, tx);

    const user = await this.users.findRoleAndActive(userId, tx);
    if (!user?.active || user.roleId !== adminRoleId) return;
    if ((await this.users.countActiveOnRole(adminRoleId, userId, tx)) > 0) {
      return;
    }
    throw new ConflictException({
      message: 'At least one active user must keep the Admin role',
      error: UserErrorCode.LAST_ADMIN,
    });
  }
}
