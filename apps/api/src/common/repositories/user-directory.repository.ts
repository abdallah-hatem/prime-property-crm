import { Injectable } from '@nestjs/common';
import type { Language } from '@prime-crm/shared';
import { DatabaseService } from '../../database/database.service';
import type { Tx } from '../interfaces/transaction.interface';
import type { UserSummary } from '../interfaces/user-summary.interface';

/**
 * Small user lookups any domain needs: is this user an active assignee, which language does the
 * caller read. Never returns the password hash.
 */
@Injectable()
export class UserDirectoryRepository {
  constructor(private readonly db: DatabaseService) {}

  /**
   * The user as a summary when they exist and are active; null otherwise. Inside a transaction
   * the row is read FOR SHARE and stays locked until `tx` ends, so a concurrent deactivation
   * (which locks the row first) waits for the assignment to commit and then hands its work
   * over, or the assignment waits for the deactivation and sees the user inactive.
   */
  async findActive(id: string, tx?: Tx): Promise<UserSummary | null> {
    if (!tx) {
      return this.db.user.findFirst({
        where: { id, active: true },
        select: { id: true, name: true },
      });
    }
    const rows = await tx.$queryRaw<UserSummary[]>`
      SELECT id, name FROM users WHERE id = ${id}::uuid AND active = true FOR SHARE`;
    return rows[0] ?? null;
  }

  /** The caller's language for localised labels (outcomes); English when unknown. */
  async languageOf(id: string, tx?: Tx): Promise<Language> {
    const row = await (tx ?? this.db).user.findUnique({
      where: { id },
      select: { language: true },
    });
    return row?.language ?? 'en';
  }
}
