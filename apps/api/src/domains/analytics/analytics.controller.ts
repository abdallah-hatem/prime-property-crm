import { Controller, Get, Param, ParseUUIDPipe, Query } from '@nestjs/common';
import { GetUser } from '../../common/decorators/get-user.decorator';
import { RequirePermission } from '../../common/decorators/require-permission.decorator';
import { AnalyticsService } from './analytics.service';
import { AnalyticsQueryDto } from './dto/analytics-query.dto';

@Controller('analytics')
@RequirePermission('analytics.view')
export class AnalyticsController {
  constructor(private readonly analytics: AnalyticsService) {}

  @Get('team')
  team(@Query() query: AnalyticsQueryDto, @GetUser('id') userId: string) {
    return this.analytics.team(query, userId);
  }

  @Get('members/:id')
  member(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Query() query: AnalyticsQueryDto,
    @GetUser('id') userId: string,
  ) {
    return this.analytics.member(id, query, userId);
  }
}
