import { Injectable } from '@nestjs/common';
import { DatabaseService } from '../../../database/database.service';

/** Failed sign-ins per (normalised) email, for the rate limit. DB-backed so it holds on serverless. */
@Injectable()
export class LoginAttemptRepository {
  constructor(private readonly db: DatabaseService) {}

  countSince(email: string, since: Date): Promise<number> {
    return this.db.loginAttempt.count({
      where: { email, createdAt: { gt: since } },
    });
  }

  async record(email: string, at: Date): Promise<void> {
    await this.db.loginAttempt.create({
      data: { email, createdAt: at },
      select: { id: true },
    });
  }

  /** Drops rows that can no longer count toward any limit. */
  async deleteOlderThan(cutoff: Date): Promise<void> {
    await this.db.loginAttempt.deleteMany({
      where: { createdAt: { lte: cutoff } },
    });
  }

  /** A successful sign-in starts the count again. */
  async clear(email: string): Promise<void> {
    await this.db.loginAttempt.deleteMany({ where: { email } });
  }
}
