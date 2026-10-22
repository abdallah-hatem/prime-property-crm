import {
  BadRequestException,
  ConflictException,
  Injectable,
} from '@nestjs/common';
import {
  toE164,
  UserErrorCode,
  type User,
  type UserDetail,
} from '@prime-crm/shared';
import type { Paginated } from '../../common/interfaces/api-response.interface';
import type { Tx } from '../../common/interfaces/transaction.interface';
import type { UserSummary } from '../../common/interfaces/user-summary.interface';
import { assertFound } from '../../common/utils/ownership.util';
import { hashPassword } from '../../common/utils/password.util';
import { toUser } from '../../common/utils/user-shape.util';
import { DatabaseService } from '../../database/database.service';
import { ActivityService } from '../activity/activity.service';
import { SessionService } from '../auth/session.service';
import { RolesService } from '../roles/roles.service';
import type { CreateUserDto } from './dto/create-user.dto';
import type { UpdateUserDto } from './dto/update-user.dto';
import type { UserListQueryDto } from './dto/user-list-query.dto';
import type { UserOptionsQueryDto } from './dto/user-options-query.dto';
import { LastAdminService } from './last-admin.service';
import {
  isUniqueViolation,
  UserRepository,
  type UserChanges,
} from './repositories/user.repository';
import { changedFields, pickChanges } from './users.pure';

const USER = 'USER';

/**
 * Accounts, managed by users with `users.manage`. Every change writes the activity log in the
 * same transaction. Deactivation and reactivation live in admin-ops (they move work around).
 */
@Injectable()
export class UsersService {
  constructor(
    private readonly db: DatabaseService,
    private readonly users: UserRepository,
    private readonly roles: RolesService,
    private readonly lastAdmin: LastAdminService,
    private readonly sessions: SessionService,
    private readonly activity: ActivityService,
  ) {}

  async list(query: UserListQueryDto): Promise<Paginated<User>> {
    const q = query.q?.trim() || undefined;
    const result = await this.users.findPage(
      {
        q,
        phone: q ? (toE164(q) ?? undefined) : undefined,
        roleId: query.roleId,
        active: query.active,
      },
      query.page,
      query.limit,
    );
    return { ...result, data: result.data.map(toUser) };
  }

  /** Picker: active users unless `active=false` asks for the deactivated ones. */
  options(query: UserOptionsQueryDto): Promise<Paginated<UserSummary>> {
    return this.users.findOptions(
      query.active ?? true,
      query.page,
      query.limit,
    );
  }

  async findOne(id: string): Promise<UserDetail> {
    const user = assertFound(await this.users.findShape(id), 'User');
    return { ...toUser(user), counts: await this.users.counts(id) };
  }

  async create(dto: CreateUserDto, actorId: string): Promise<User> {
    const passwordHash = await hashPassword(dto.password);
    return this.withEmailGuard(() =>
      this.db.transaction(async (tx) => {
        await this.assertRoleExists(dto.roleId, tx);
        await this.assertEmailFree(dto.email, tx);
        const user = await this.users.create(
          {
            name: dto.name,
            email: dto.email,
            phone: dto.phone ? toE164(dto.phone) : null,
            roleId: dto.roleId,
            language: dto.language,
            passwordHash,
          },
          tx,
        );
        await this.activity.record(tx, {
          type: 'USER_CREATE',
          actorId,
          summary: `Created user ${user.name}`,
          target: { kind: USER, id: user.id, label: user.name },
          details: { role: { id: user.role.id, name: user.role.name } },
        });
        return toUser(user);
      }),
    );
  }

  /**
   * Changes only what differs (an unchanged body writes nothing and logs nothing). Moving the
   * last active admin off the Admin role answers 409 LAST_ADMIN.
   */
  async update(id: string, dto: UpdateUserDto, actorId: string): Promise<User> {
    return this.withEmailGuard(() =>
      this.db.transaction(async (tx) => {
        const current = assertFound(await this.users.findShape(id, tx), 'User');
        const changes: UserChanges = {
          name: dto.name,
          email: dto.email,
          phone: dto.phone === undefined ? undefined : toE164(dto.phone),
          roleId: dto.roleId,
          language: dto.language,
        };
        const changed = changedFields(current, changes);
        if (changed.length === 0) return toUser(current);

        if (changes.email !== undefined && changed.includes('email')) {
          await this.assertEmailFree(changes.email, tx, id);
        }
        if (changes.roleId !== undefined && changed.includes('roleId')) {
          await this.assertRoleExists(changes.roleId, tx);
          await this.lastAdmin.assertNotLastActiveAdmin(tx, id);
        }

        const updated = await this.users.update(
          id,
          pickChanges(changes, changed),
          tx,
        );
        await this.activity.record(tx, {
          type: 'USER_UPDATE',
          actorId,
          summary: `Updated user ${updated.name}`,
          target: { kind: USER, id, label: updated.name },
          details: {
            changed,
            ...(changed.includes('roleId')
              ? {
                  role: {
                    from: { id: current.role.id, name: current.role.name },
                    to: { id: updated.role.id, name: updated.role.name },
                  },
                }
              : {}),
          },
        });
        return toUser(updated);
      }),
    );
  }

  /** Sets a new password and ends every session of that user, in one transaction. */
  async resetPassword(
    id: string,
    newPassword: string,
    actorId: string,
  ): Promise<void> {
    const passwordHash = await hashPassword(newPassword);
    await this.db.transaction(async (tx) => {
      const user = assertFound(await this.users.findShape(id, tx), 'User');
      await this.users.updatePasswordHash(id, passwordHash, tx);
      const sessionsEnded = await this.sessions.revokeAllSessions(tx, id);
      await this.activity.record(tx, {
        type: 'PASSWORD_RESET',
        actorId,
        summary: `Reset the password of ${user.name}`,
        target: { kind: USER, id, label: user.name },
        details: { sessionsEnded },
      });
    });
  }

  private async assertRoleExists(roleId: string, tx: Tx): Promise<void> {
    if (!(await this.roles.findById(roleId, tx))) {
      throw new BadRequestException({
        message: 'That role does not exist',
        error: UserErrorCode.INVALID_ROLE,
      });
    }
  }

  private async assertEmailFree(
    email: string,
    tx: Tx,
    exceptId?: string,
  ): Promise<void> {
    const holder = await this.users.findIdByEmail(email, tx);
    if (holder !== null && holder !== exceptId) throw this.emailTaken();
  }

  /** A concurrent write that won the unique index answers the same 409 as the pre-check. */
  private async withEmailGuard<T>(work: () => Promise<T>): Promise<T> {
    try {
      return await work();
    } catch (error) {
      if (isUniqueViolation(error)) throw this.emailTaken();
      throw error;
    }
  }

  private emailTaken(): ConflictException {
    return new ConflictException({
      message: 'Another user already has this email',
      error: UserErrorCode.EMAIL_TAKEN,
    });
  }
}
