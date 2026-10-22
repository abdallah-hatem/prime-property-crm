import { Controller, Get, Query } from '@nestjs/common';
import { GetUser } from '../../common/decorators/get-user.decorator';
import type { CurrentUser } from '../../common/interfaces/current-user.interface';
import { ResponseUtil } from '../../common/utils/response.util';
import { ReminderQueryDto } from './dto/reminder-query.dto';
import { RemindersService } from './reminders.service';

@Controller('reminders')
export class RemindersController {
  constructor(private readonly reminders: RemindersService) {}

  @Get()
  async list(@Query() query: ReminderQueryDto, @GetUser() user: CurrentUser) {
    return ResponseUtil.paginated(await this.reminders.list(query, user));
  }
}
