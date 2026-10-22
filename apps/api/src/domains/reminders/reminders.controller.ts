import {
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { GetUser } from '../../common/decorators/get-user.decorator';
import type { CurrentUser } from '../../common/interfaces/current-user.interface';
import { ResponseUtil } from '../../common/utils/response.util';
import { CreateReminderDto } from './dto/create-reminder.dto';
import { ReminderQueryDto } from './dto/reminder-query.dto';
import { UpdateReminderDto } from './dto/update-reminder.dto';
import { RemindersService } from './reminders.service';

const Id = () => Param('id', new ParseUUIDPipe());

@Controller('reminders')
export class RemindersController {
  constructor(private readonly reminders: RemindersService) {}

  @Get()
  async list(@Query() query: ReminderQueryDto, @GetUser() user: CurrentUser) {
    return ResponseUtil.paginated(await this.reminders.list(query, user));
  }

  @Post()
  create(@Body() dto: CreateReminderDto, @GetUser() user: CurrentUser) {
    return this.reminders.create(dto, user);
  }

  @Patch(':id')
  update(
    @Id() id: string,
    @Body() dto: UpdateReminderDto,
    @GetUser() user: CurrentUser,
  ) {
    return this.reminders.update(id, dto, user);
  }

  @Post(':id/done')
  @HttpCode(200)
  done(@Id() id: string, @GetUser() user: CurrentUser) {
    return this.reminders.done(id, user);
  }
}
