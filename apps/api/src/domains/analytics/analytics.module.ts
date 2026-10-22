import { Module } from '@nestjs/common';
import { AnalyticsController } from './analytics.controller';
import { AnalyticsService } from './analytics.service';
import { AnalyticsRepository } from './repositories/analytics.repository';

/** `GET /analytics/team`, `GET /analytics/members/:id` (analytics.view). */
@Module({
  controllers: [AnalyticsController],
  providers: [AnalyticsService, AnalyticsRepository],
})
export class AnalyticsModule {}
