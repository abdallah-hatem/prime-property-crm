import { Controller, Get, Query } from '@nestjs/common';
import { RequirePermission } from '../../common/decorators/require-permission.decorator';
import { ResponseUtil } from '../../common/utils/response.util';
import { ActivityService } from './activity.service';
import { ActivityQueryDto } from './dto/activity-query.dto';

@Controller('activity')
@RequirePermission('activity.view')
export class ActivityController {
  constructor(private readonly activity: ActivityService) {}

  @Get()
  async list(@Query() query: ActivityQueryDto) {
    return ResponseUtil.paginated(await this.activity.list(query));
  }
}
