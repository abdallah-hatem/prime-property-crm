import { Injectable } from '@nestjs/common';
import type { Language, Prisma } from '@prisma/client';
import type { Paginated } from '../../../common/interfaces/api-response.interface';
import type { Tx } from '../../../common/interfaces/transaction.interface';
import type { UserSummary } from '../../../common/interfaces/user-summary.interface';
import { LIVE } from '../../../common/repositories/soft-delete.repository';
import { escapeLike } from '../../../common/utils/like.util';
import {
  USER_SHAPE_SELECT,
  type UserShapeRow,
} from '../../../common/utils/user-shape.util';
import { DatabaseService } from '../../../database/database.service';

export interface UserListFilter {
  /** Free text: name, email or phone, case-insensitive. */
  q?: string;
  /** The E.164 form of `q` when it reads as a phone. */
  phone?: string;
  roleId?: string;
  active?: boolean;
}

export interface NewUser {
  name: string;
  email: string;
  phone: string | null;
  roleId: string;
  language: Language;
  passwordHash: string;
}

export interface UserChanges {
  name?: string;
  email?: string;
  phone?: string | null;
  roleId?: string;
  language?: Language;
}

export interface UserCounts {
  owners: number;
  listings: number;
  openReminders: number;
}

/** True for a unique violation as Prisma reports it (P2002), matched like the exception filter does. */
export function isUniqueViolation(error: unknown): boolean {
  return (
    error instanceof Error &&
    error.name === 'PrismaClientKnownRequestError' &&
    (error as { code?: unknown }).code === 'P2002'
  );
}

/** Users for `/users`. Every select is explicit: the row holds the password hash. */
@Injectable()
export class UserRepository {
  constructor(private readonly db: DatabaseService) {}

  private client(tx?: Tx) {
    return tx ?? this.db;
  }

  async findPage(
    filter: UserListFilter,
    page: number,
    limit: number,
  ): Promise<Paginated<UserShapeRow>> {
    const q = filter.q === undefined ? undefined : escapeLike(filter.q);
    const where: Prisma.UserWhereInput = {
      ...(filter.roleId ? { roleId: filter.roleId } : {}),
      ...(filter.active === undefined ? {} : { active: filter.active }),
      ...(q
        ? {
            OR: [
              { name: { contains: q, mode: 'insensitive' } },
              { email: { contains: q, mode: 'insensitive' } },
              { phone: { contains: q } },
              ...(filter.phone ? [{ phone: filter.phone }] : []),
            ],
          }
        : {}),
    };
    const [data, total] = await Promise.all([
      this.db.user.findMany({
        where,
        select: USER_SHAPE_SELECT,
        orderBy: [{ name: 'asc' }, { id: 'asc' }],
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.db.user.count({ where }),
    ]);
    return {
      data,
      total,
      page,
      limit,
      hasNextPage: page * limit < total,
      hasPreviousPage: page > 1,
    };
  }

  async findOptions(
    active: boolean,
    page: number,
    limit: number,
  ): Promise<Paginated<UserSummary>> {
    const where = { active };
    const [data, total] = await Promise.all([
      this.db.user.findMany({
        where,
        select: { id: true, name: true },
        orderBy: [{ name: 'asc' }, { id: 'asc' }],
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.db.user.count({ where }),
    ]);
    return {
      data,
      total,
      page,
      limit,
      hasNextPage: page * limit < total,
      hasPreviousPage: page > 1,
    };
  }

  findShape(id: string, tx?: Tx): Promise<UserShapeRow | null> {
    return this.client(tx).user.findUnique({
      where: { id },
      select: USER_SHAPE_SELECT,
    });
  }

  /** `email` must already be normalised (stored trimmed and lower-cased). */
  async findIdByEmail(email: string, tx?: Tx): Promise<string | null> {
    const row = await this.client(tx).user.findUnique({
      where: { email },
      select: { id: true },
    });
    return row?.id ?? null;
  }

  async counts(id: string): Promise<UserCounts> {
    const [owners, listings, openReminders] = await Promise.all([
      this.db.owner.count({ where: { assignedToId: id, ...LIVE } }),
      this.db.listing.count({ where: { assignedToId: id, ...LIVE } }),
      this.db.reminder.count({ where: { memberId: id, doneAt: null } }),
    ]);
    return { owners, listings, openReminders };
  }

  create(data: NewUser, tx: Tx): Promise<UserShapeRow> {
    return tx.user.create({ data, select: USER_SHAPE_SELECT });
  }

  update(id: string, data: UserChanges, tx: Tx): Promise<UserShapeRow> {
    return tx.user.update({ where: { id }, data, select: USER_SHAPE_SELECT });
  }

  async updatePasswordHash(
    id: string,
    passwordHash: string,
    tx: Tx,
  ): Promise<void> {
    await tx.user.update({
      where: { id },
      data: { passwordHash },
      select: { id: true },
    });
  }

  /**
   * Takes the Admin role's row lock (FOR NO KEY UPDATE) until `tx` ends: the mutex every change
   * that could leave no active admin holds while it counts. Two such changes run one after the
   * other, and the second counts what the first committed (READ COMMITTED takes a new snapshot
   * per statement). Creating or promoting users is not blocked (their FK takes KEY SHARE).
   */
  async lockAdminRole(adminRoleId: string, tx: Tx): Promise<void> {
    await tx.$queryRaw`SELECT id FROM roles WHERE id = ${adminRoleId}::uuid FOR NO KEY UPDATE`;
  }

  findRoleAndActive(
    id: string,
    tx: Tx,
  ): Promise<{ roleId: string; active: boolean } | null> {
    return tx.user.findUnique({
      where: { id },
      select: { roleId: true, active: true },
    });
  }

  countActiveOnRole(roleId: string, exceptUserId: string, tx: Tx) {
    return tx.user.count({
      where: { roleId, active: true, id: { not: exceptUserId } },
    });
  }
}
