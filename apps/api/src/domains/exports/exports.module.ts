import { Module } from '@nestjs/common';
import { ActivityModule } from '../activity/activity.module';
import { ListingsModule } from '../listings/listings.module';
import { OwnersModule } from '../owners/owners.module';
import { ExportsController } from './exports.controller';
import { ExportsService } from './exports.service';

/** `GET /exports/owners`, `GET /exports/listings` (data.export): `.xlsx` files. */
@Module({
  imports: [ActivityModule, ListingsModule, OwnersModule],
  controllers: [ExportsController],
  providers: [ExportsService],
})
export class ExportsModule {}
