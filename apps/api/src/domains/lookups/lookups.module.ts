import { Module } from '@nestjs/common';
import { LookupsController } from './lookups.controller';
import { LookupsService } from './lookups.service';
import { AreaRepository } from './repositories/area.repository';

/** Picker lookups (`GET /lookups/areas`). */
@Module({
  controllers: [LookupsController],
  providers: [LookupsService, AreaRepository],
})
export class LookupsModule {}
