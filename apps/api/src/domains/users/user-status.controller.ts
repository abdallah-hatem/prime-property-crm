import { Body, Controller, HttpCode, Param, Post } from '@nestjs/common';
import { GetUser } from '../../common/decorators/get-user.decorator';
import { RequirePermission } from '../../common/decorators/require-permission.decorator';
import { DeactivateUserDto } from './dto/deactivate-user.dto';
import { IdParamDto } from './dto/id-param.dto';
import { UserStatusService } from './user-status.service';

/** `POST /users/:id/deactivate` and `/reactivate` (users.manage). */
@Controller('users')
@RequirePermission('users.manage')
export class UserStatusController {
  constructor(private readonly status: UserStatusService) {}

  @Post(':id/deactivate')
  @HttpCode(200)
  deactivate(
    @Param() { id }: IdParamDto,
    @Body() dto: DeactivateUserDto,
    @GetUser('id') actorId: string,
  ) {
    return this.status.deactivate(id, dto.handOverTo, actorId);
  }

  @Post(':id/reactivate')
  @HttpCode(200)
  reactivate(@Param() { id }: IdParamDto, @GetUser('id') actorId: string) {
    return this.status.reactivate(id, actorId);
  }
}
