import { Injectable } from '@nestjs/common';
import { DatabaseService } from '../../database/database.service';
import type { Tx } from '../interfaces/transaction.interface';

/** The ad check-in interval when the settings row is missing (the seed always writes it). */
export const DEFAULT_AD_CHECK_IN_DAYS = 7;

/**
 * Reads the single settings row (id = 1). The settings endpoints (T10) write it; any domain
 * that needs a setting reads it here, inside its transaction when it has one.
 */
@Injectable()
export class SettingsRepository {
  constructor(private readonly db: DatabaseService) {}

  /** Days between ad check-ins (1–90): applies to check-ins scheduled from now on. */
  async adCheckInDays(tx?: Tx): Promise<number> {
    const row = await (tx ?? this.db).setting.findUnique({
      where: { id: 1 },
      select: { adCheckInDays: true },
    });
    return row?.adCheckInDays ?? DEFAULT_AD_CHECK_IN_DAYS;
  }
}
