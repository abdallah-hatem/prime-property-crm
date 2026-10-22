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

  /**
   * The interval under a row lock held until `tx` ends, so two concurrent changes run one after
   * the other and each logs the value it really replaced. Creates the row when it is missing.
   */
  async lockAdCheckInDays(tx: Tx): Promise<number> {
    await tx.setting.upsert({
      where: { id: 1 },
      update: {},
      create: { id: 1, adCheckInDays: DEFAULT_AD_CHECK_IN_DAYS },
      select: { id: true },
    });
    const rows = await tx.$queryRaw<{ days: number }[]>`
      SELECT ad_check_in_days AS days FROM settings WHERE id = 1 FOR UPDATE`;
    return rows[0]?.days ?? DEFAULT_AD_CHECK_IN_DAYS;
  }

  async setAdCheckInDays(tx: Tx, days: number, byId: string): Promise<number> {
    const row = await tx.setting.update({
      where: { id: 1 },
      data: { adCheckInDays: days, updatedById: byId },
      select: { adCheckInDays: true },
    });
    return row.adCheckInDays;
  }
}
