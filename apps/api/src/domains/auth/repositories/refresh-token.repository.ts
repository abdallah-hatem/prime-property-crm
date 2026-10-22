import { Injectable } from '@nestjs/common';
import type { Tx } from '../../../common/interfaces/transaction.interface';
import { DatabaseService } from '../../../database/database.service';

/** The columns the rotation rules read (refresh.pure.ts). */
export interface RefreshTokenRow {
  id: string;
  userId: string;
  familyId: string;
  expiresAt: Date;
  usedAt: Date | null;
  revokedAt: Date | null;
}

const ROW_SELECT = {
  id: true,
  userId: true,
  familyId: true,
  expiresAt: true,
  usedAt: true,
  revokedAt: true,
} as const;

export interface NewRefreshToken {
  userId: string;
  familyId: string;
  tokenHash: string;
  expiresAt: Date;
  createdAt: Date;
}

/** Refresh tokens, stored by hash only. Every method joins the caller's transaction. */
@Injectable()
export class RefreshTokenRepository {
  constructor(private readonly db: DatabaseService) {}

  async create(data: NewRefreshToken, tx?: Tx): Promise<{ id: string }> {
    return (tx ?? this.db).refreshToken.create({ data, select: { id: true } });
  }

  findByHash(tokenHash: string, tx?: Tx): Promise<RefreshTokenRow | null> {
    return (tx ?? this.db).refreshToken.findUnique({
      where: { tokenHash },
      select: ROW_SELECT,
    });
  }

  /**
   * Marks a never-used, unrevoked token used. Returns false when another request got there
   * first (the row lock makes the second caller re-read and miss the `usedAt: null` match).
   */
  async claim(id: string, now: Date, tx: Tx): Promise<boolean> {
    const { count } = await tx.refreshToken.updateMany({
      where: { id, usedAt: null, revokedAt: null },
      data: { usedAt: now },
    });
    return count === 1;
  }

  async linkReplacement(
    id: string,
    replacedById: string,
    tx: Tx,
  ): Promise<void> {
    await tx.refreshToken.update({
      where: { id },
      data: { replacedById },
      select: { id: true },
    });
  }

  async revokeFamily(familyId: string, now: Date, tx?: Tx): Promise<void> {
    await (tx ?? this.db).refreshToken.updateMany({
      where: { familyId, revokedAt: null },
      data: { revokedAt: now },
    });
  }

  /** Revokes every live token of the user, except the family `keepFamilyId` when given. */
  async revokeAllForUser(
    userId: string,
    now: Date,
    tx: Tx,
    keepFamilyId?: string,
  ): Promise<number> {
    const { count } = await tx.refreshToken.updateMany({
      where: {
        userId,
        revokedAt: null,
        ...(keepFamilyId ? { familyId: { not: keepFamilyId } } : {}),
      },
      data: { revokedAt: now },
    });
    return count;
  }
}
