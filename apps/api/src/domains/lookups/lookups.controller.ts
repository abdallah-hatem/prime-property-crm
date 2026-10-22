import { Controller, Get, Query } from '@nestjs/common';
import { ResponseUtil } from '../../common/utils/response.util';
import { AreaLookupQueryDto } from './dto/area-lookup-query.dto';
import { LookupsService } from './lookups.service';

@Controller('lookups')
export class LookupsController {
  constructor(private readonly lookups: LookupsService) {}

  @Get('areas')
  async areas(@Query() query: AreaLookupQueryDto) {
    return ResponseUtil.paginated(await this.lookups.areas(query));
  }
}
