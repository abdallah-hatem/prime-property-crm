import { Injectable } from '@nestjs/common';
import type { Settings } from '@prime-crm/shared';
import { SettingsRepository } from '../../common/repositories/settings.repository';
import { DatabaseService } from '../../database/database.service';
import { ActivityService } from '../activity/activity.service';
import type { UpdateSettingsDto } from './dto/update-settings.dto';

/**
 * App settings: today only the ad check-in interval. A change applies to check-ins scheduled
 * after it (listings read the interval when they schedule one); open check-ins keep their due
 * time.
 */
@Injectable()
export class SettingsService {
  constructor(
    private readonly db: DatabaseService,
    private readonly settings: SettingsRepository,
    private readonly activity: ActivityService,
  ) {}

  async get(): Promise<Settings> {
    return { adCheckInDays: await this.settings.adCheckInDays() };
  }

  /** Saves and logs SETTINGS_UPDATE with from/to; the same value again changes and logs nothing. */
  async update(dto: UpdateSettingsDto, actorId: string): Promise<Settings> {
    return this.db.transaction(async (tx) => {
      const from = await this.settings.lockAdCheckInDays(tx);
      if (from === dto.adCheckInDays) return { adCheckInDays: from };
      const to = await this.settings.setAdCheckInDays(
        tx,
        dto.adCheckInDays,
        actorId,
      );
      await this.activity.record(tx, {
        type: 'SETTINGS_UPDATE',
        actorId,
        summary: `Changed the ad check-in interval from ${from} to ${to} days`,
        details: { adCheckInDays: { from, to } },
      });
      return { adCheckInDays: to };
    });
  }
}
