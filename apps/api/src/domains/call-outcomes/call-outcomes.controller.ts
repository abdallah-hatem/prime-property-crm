import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { GetUser } from '../../common/decorators/get-user.decorator';
import { RequirePermission } from '../../common/decorators/require-permission.decorator';
import type { CurrentUser } from '../../common/interfaces/current-user.interface';
import { ResponseUtil } from '../../common/utils/response.util';
import { CallOutcomesService } from './call-outcomes.service';
import { CallOutcomeQueryDto } from './dto/call-outcome-query.dto';
import { CreateCallOutcomeDto } from './dto/create-call-outcome.dto';
import { UpdateCallOutcomeDto } from './dto/update-call-outcome.dto';

const Id = () => Param('id', new ParseUUIDPipe());

@Controller('call-outcomes')
export class CallOutcomesController {
  constructor(private readonly outcomes: CallOutcomesService) {}

  @Get()
  async list(
    @Query() query: CallOutcomeQueryDto,
    @GetUser() user: CurrentUser,
  ) {
    return ResponseUtil.paginated(await this.outcomes.list(query, user));
  }

  @Post()
  @RequirePermission('settings.manage')
  create(@Body() dto: CreateCallOutcomeDto, @GetUser() user: CurrentUser) {
    return this.outcomes.create(dto, user);
  }

  @Patch(':id')
  @RequirePermission('settings.manage')
  update(
    @Id() id: string,
    @Body() dto: UpdateCallOutcomeDto,
    @GetUser() user: CurrentUser,
  ) {
    return this.outcomes.update(id, dto, user);
  }

  @Delete(':id')
  @RequirePermission('settings.manage')
  async remove(@Id() id: string, @GetUser() user: CurrentUser) {
    await this.outcomes.remove(id, user);
    return ResponseUtil.deleted('Call outcome deleted');
  }
}
