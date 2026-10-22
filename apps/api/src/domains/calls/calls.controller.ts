import {
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
} from '@nestjs/common';
import { GetUser } from '../../common/decorators/get-user.decorator';
import type { CurrentUser } from '../../common/interfaces/current-user.interface';
import { ResponseUtil } from '../../common/utils/response.util';
import { CallsService } from './calls.service';
import { CallQueryDto } from './dto/call-query.dto';
import { SetOutcomeDto } from './dto/set-outcome.dto';
import { StartCallDto } from './dto/start-call.dto';

const Id = () => Param('id', new ParseUUIDPipe());

/** Calls have no edit or delete route: they are the activity record. */
@Controller()
export class CallsController {
  constructor(private readonly calls: CallsService) {}

  @Post('owners/:id/calls')
  start(
    @Id() ownerId: string,
    @Body() dto: StartCallDto,
    @GetUser() user: CurrentUser,
  ) {
    return this.calls.start(ownerId, dto, user);
  }

  @Post('calls/:id/outcome')
  @HttpCode(200)
  setOutcome(
    @Id() id: string,
    @Body() dto: SetOutcomeDto,
    @GetUser() user: CurrentUser,
  ) {
    return this.calls.setOutcome(id, dto, user);
  }

  @Get('calls')
  async list(@Query() query: CallQueryDto, @GetUser() user: CurrentUser) {
    return ResponseUtil.paginated(await this.calls.list(query, user));
  }
}
