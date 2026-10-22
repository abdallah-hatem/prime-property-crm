import {
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { GetUser } from '../../common/decorators/get-user.decorator';
import { RequirePermission } from '../../common/decorators/require-permission.decorator';
import { ResponseUtil } from '../../common/utils/response.util';
import { RequireAnyPermission } from './any-permission';
import { CreateUserDto } from './dto/create-user.dto';
import { IdParamDto } from './dto/id-param.dto';
import { ResetPasswordDto } from './dto/reset-password.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { UserListQueryDto } from './dto/user-list-query.dto';
import { UserOptionsQueryDto } from './dto/user-options-query.dto';
import { UsersService } from './users.service';

@Controller('users')
export class UsersController {
  constructor(private readonly users: UsersService) {}

  @Get()
  @RequirePermission('users.manage')
  async list(@Query() query: UserListQueryDto) {
    return ResponseUtil.paginated(await this.users.list(query));
  }

  /** Picker for assigning work and filtering by member. */
  @Get('options')
  @RequireAnyPermission('owners.assign', 'users.manage')
  async options(@Query() query: UserOptionsQueryDto) {
    return ResponseUtil.paginated(await this.users.options(query));
  }

  @Post()
  @RequirePermission('users.manage')
  create(@Body() dto: CreateUserDto, @GetUser('id') actorId: string) {
    return this.users.create(dto, actorId);
  }

  @Get(':id')
  @RequirePermission('users.manage')
  findOne(@Param() { id }: IdParamDto) {
    return this.users.findOne(id);
  }

  @Patch(':id')
  @RequirePermission('users.manage')
  update(
    @Param() { id }: IdParamDto,
    @Body() dto: UpdateUserDto,
    @GetUser('id') actorId: string,
  ) {
    return this.users.update(id, dto, actorId);
  }

  @Post(':id/reset-password')
  @RequirePermission('users.manage')
  @HttpCode(200)
  async resetPassword(
    @Param() { id }: IdParamDto,
    @Body() dto: ResetPasswordDto,
    @GetUser('id') actorId: string,
  ) {
    await this.users.resetPassword(id, dto.newPassword, actorId);
    return ResponseUtil.success(null, 'Password reset; their sessions ended');
  }
}
