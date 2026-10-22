import { Injectable } from '@nestjs/common';
import type { Language } from '@prime-crm/shared';
import type { Tx } from '../../../common/interfaces/transaction.interface';
import {
  USER_SHAPE_SELECT,
  type UserShapeRow,
} from '../../../common/utils/user-shape.util';
import { DatabaseService } from '../../../database/database.service';

/** What sign-in needs: the shape plus the hash. Never returned to a client. */
export type LoginUserRow = UserShapeRow & { passwordHash: string };

export interface ProfileChanges {
  name?: string;
  phone?: string | null;
  language?: Language;
}

/** The user reads and writes auth needs. Every select is explicit (the row holds the hash). */
@Injectable()
export class AuthUserRepository {
  constructor(private readonly db: DatabaseService) {}

  /** `email` must already be normalised (trimmed, lower-cased): it is stored that way. */
  findForLogin(email: string): Promise<LoginUserRow | null> {
    return this.db.user.findUnique({
      where: { email },
      select: { ...USER_SHAPE_SELECT, passwordHash: true },
    });
  }

  findShape(id: string, tx?: Tx): Promise<UserShapeRow | null> {
    return (tx ?? this.db).user.findUnique({
      where: { id },
      select: USER_SHAPE_SELECT,
    });
  }

  /** True only for an existing, active user (the per-request check of the JWT strategy). */
  async isActive(id: string): Promise<boolean> {
    const row = await this.db.user.findUnique({
      where: { id },
      select: { active: true },
    });
    return row?.active === true;
  }

  async findPasswordHash(id: string): Promise<string | null> {
    const row = await this.db.user.findUnique({
      where: { id },
      select: { passwordHash: true },
    });
    return row?.passwordHash ?? null;
  }

  updateProfile(id: string, changes: ProfileChanges): Promise<UserShapeRow> {
    return this.db.user.update({
      where: { id },
      data: changes,
      select: USER_SHAPE_SELECT,
    });
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
}
