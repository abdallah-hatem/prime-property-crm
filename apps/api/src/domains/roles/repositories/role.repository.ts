import { Injectable } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import type { Paginated } from '../../../common/interfaces/api-response.interface';
import type { Tx } from '../../../common/interfaces/transaction.interface';
import { DatabaseService } from '../../../database/database.service';

export const ROLE_SELECT = {
  id: true,
  name: true,
  builtIn: true,
  permissions: true,
  _count: { select: { users: true } },
} as const satisfies Prisma.RoleSelect;

export type RoleRow = Prisma.RoleGetPayload<{ select: typeof ROLE_SELECT }>;

/** Roles for `/roles`. Built-in roles are found by `builtIn`, never by their editable name. */
@Injectable()
export class RoleRepository {
  constructor(private readonly db: DatabaseService) {}

  /** Built-in roles first (Admin, then Team member), then custom roles by name. */
  async findPage(page: number, limit: number): Promise<Paginated<RoleRow>> {
    const [data, total] = await Promise.all([
      this.db.role.findMany({
        select: ROLE_SELECT,
        orderBy: [
          { builtIn: { sort: 'asc', nulls: 'last' } },
          { name: 'asc' },
          { id: 'asc' },
        ],
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.db.role.count(),
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

  findById(id: string, tx?: Tx): Promise<RoleRow | null> {
    return (tx ?? this.db).role.findUnique({
      where: { id },
      select: ROLE_SELECT,
    });
  }

  /** Another role with this name, ignoring case (`exceptId` skips the role being renamed). */
  async nameTaken(name: string, tx: Tx, exceptId?: string): Promise<boolean> {
    const row = await tx.role.findFirst({
      where: {
        name: { equals: name, mode: 'insensitive' },
        ...(exceptId ? { id: { not: exceptId } } : {}),
      },
      select: { id: true },
    });
    return row !== null;
  }

  create(
    data: { name: string; permissions: string[] },
    tx: Tx,
  ): Promise<RoleRow> {
    return tx.role.create({ data, select: ROLE_SELECT });
  }

  update(
    id: string,
    data: { name?: string; permissions?: string[] },
    tx: Tx,
  ): Promise<RoleRow> {
    return tx.role.update({ where: { id }, data, select: ROLE_SELECT });
  }

  /**
   * Locks the role row, then counts its users: a user moved onto it concurrently waits for the
   * delete (its FK check needs the row), so a role in use is never deleted.
   */
  async lockAndCountUsers(id: string, tx: Tx): Promise<number> {
    await tx.$queryRaw`SELECT id FROM roles WHERE id = ${id}::uuid FOR UPDATE`;
    return tx.user.count({ where: { roleId: id } });
  }

  async delete(id: string, tx: Tx): Promise<void> {
    await tx.role.delete({ where: { id }, select: { id: true } });
  }
}
