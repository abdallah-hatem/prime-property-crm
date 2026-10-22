import { Module } from '@nestjs/common';
import { ActivityModule } from '../activity/activity.module';
import { SettingsController } from './settings.controller';
import { SettingsService } from './settings.service';

/**
 * `/settings`. Reads and writes go through the global SettingsRepository (common), which other
 * domains use to read the interval inside their own transactions.
 */
@Module({
  imports: [ActivityModule],
  controllers: [SettingsController],
  providers: [SettingsService],
})
export class SettingsModule {}
