import {
  BadRequestException,
  ConflictException,
  Injectable,
} from '@nestjs/common';
import {
  PERMISSIONS,
  RoleErrorCode,
  type PermissionInfo,
  type Role,
} from '@prime-crm/shared';
import type { Paginated } from '../../common/interfaces/api-response.interface';
import type { Tx } from '../../common/interfaces/transaction.interface';
import { assertFound } from '../../common/utils/ownership.util';
import { rolePermissions } from '../../common/utils/user-shape.util';
import { DatabaseService } from '../../database/database.service';
import { ActivityService } from '../activity/activity.service';
import type { CreateRoleDto } from './dto/create-role.dto';
import type { UpdateRoleDto } from './dto/update-role.dto';
import { RoleRepository, type RoleRow } from './repositories/role.repository';
import {
  canonicalPermissions,
  changesAdminPermissions,
  permissionDiff,
  toRole,
} from './roles.pure';

const ROLE = 'ROLE';

/**
 * Roles are permission sets from the fixed list. Admin (every key, always) and Team member are
 * built in: both can be renamed, neither deleted, and Admin's permissions never change.
 * Every change writes the activity log in its own transaction.
 */
@Injectable()
export class RolesService {
  constructor(
    private readonly db: DatabaseService,
    private readonly roles: RoleRepository,
    private readonly activity: ActivityService,
  ) {}

  permissions(): PermissionInfo[] {
    return PERMISSIONS.map(({ key, labelEn, labelAr }) => ({
      key,
      labelEn,
      labelAr,
    }));
  }

  async list(page: number, limit: number): Promise<Paginated<Role>> {
    const result = await this.roles.findPage(page, limit);
    return { ...result, data: result.data.map(toRole) };
  }

  /** The role, read inside `tx` (users check a `roleId` with it). Null when there is none. */
  findById(id: string, tx: Tx): Promise<RoleRow | null> {
    return this.roles.findById(id, tx);
  }

  async create(dto: CreateRoleDto, actorId: string): Promise<Role> {
    const permissions = canonicalPermissions(dto.permissions);
    return this.db.transaction(async (tx) => {
      await this.assertNameFree(dto.name, tx);
      const role = await this.roles.create({ name: dto.name, permissions }, tx);
      await this.activity.record(tx, {
        type: 'ROLE_CREATE',
        actorId,
        summary: `Created role ${role.name}`,
        target: { kind: ROLE, id: role.id, label: role.name },
        details: { permissions },
      });
      return toRole(role);
    });
  }

  async update(id: string, dto: UpdateRoleDto, actorId: string): Promise<Role> {
    return this.db.transaction(async (tx) => {
      const role = assertFound(await this.roles.findById(id, tx), 'Role');
      if (changesAdminPermissions(role.builtIn, dto.permissions)) {
        throw new BadRequestException({
          message: "The Admin role's permissions can't be changed",
          error: RoleErrorCode.BUILT_IN_ROLE,
        });
      }

      const changes: { name?: string; permissions?: string[] } = {};
      const details: Record<string, unknown> = {};
      if (dto.name !== undefined && dto.name !== role.name) {
        await this.assertNameFree(dto.name, tx, id);
        changes.name = dto.name;
        details.name = { from: role.name, to: dto.name };
      }
      // Admin's list is fixed (every key); only custom and Team member lists are saved.
      if (dto.permissions !== undefined && role.builtIn !== 'ADMIN') {
        const prev = rolePermissions(role);
        const next = canonicalPermissions(dto.permissions);
        const diff = permissionDiff(prev, next);
        if (diff.added.length || diff.removed.length) {
          changes.permissions = next;
          details.permissions = diff;
        }
      }
      if (Object.keys(changes).length === 0) return toRole(role);

      const updated = await this.roles.update(id, changes, tx);
      await this.activity.record(tx, {
        type: 'ROLE_UPDATE',
        actorId,
        summary: `Updated role ${updated.name}`,
        target: { kind: ROLE, id, label: updated.name },
        details,
      });
      return toRole(updated);
    });
  }

  async remove(id: string, actorId: string): Promise<void> {
    await this.db.transaction(async (tx) => {
      const role = assertFound(await this.roles.findById(id, tx), 'Role');
      if (role.builtIn !== null) {
        throw new BadRequestException({
          message: 'Built-in roles can’t be deleted',
          error: RoleErrorCode.BUILT_IN_ROLE,
        });
      }
      const users = await this.roles.lockAndCountUsers(id, tx);
      if (users > 0) {
        throw new ConflictException({
          message: `${users} user(s) still have this role. Move them to another role first.`,
          error: RoleErrorCode.ROLE_IN_USE,
          data: { userCount: users },
        });
      }
      await this.roles.delete(id, tx);
      await this.activity.record(tx, {
        type: 'ROLE_DELETE',
        actorId,
        summary: `Deleted role ${role.name}`,
        target: { kind: ROLE, id, label: role.name },
        details: { permissions: rolePermissions(role) },
      });
    });
  }

  private async assertNameFree(name: string, tx: Tx, exceptId?: string) {
    if (await this.roles.nameTaken(name, tx, exceptId)) {
      throw new ConflictException({
        message: 'Another role already has this name',
        error: RoleErrorCode.ROLE_NAME_TAKEN,
      });
    }
  }
}
