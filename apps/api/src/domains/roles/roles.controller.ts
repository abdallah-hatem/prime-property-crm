import {
  Body,
  Controller,
  Delete,
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
import { RequireAnyPermission } from '../users/any-permission';
import { IdParamDto } from '../users/dto/id-param.dto';
import { PickerQueryDto } from '../users/dto/picker-query.dto';
import { CreateRoleDto } from './dto/create-role.dto';
import { UpdateRoleDto } from './dto/update-role.dto';
import { RolesService } from './roles.service';

@Controller('roles')
export class RolesController {
  constructor(private readonly roles: RolesService) {}

  @Get('permissions')
  @RequirePermission('roles.manage')
  permissions() {
    return this.roles.permissions();
  }

  /** Picker: the users screen needs the roles too (`roles.manage` or `users.manage`). */
  @Get()
  @RequireAnyPermission('roles.manage', 'users.manage')
  async list(@Query() query: PickerQueryDto) {
    return ResponseUtil.paginated(
      await this.roles.list(query.page, query.limit),
    );
  }

  @Post()
  @RequirePermission('roles.manage')
  create(@Body() dto: CreateRoleDto, @GetUser('id') actorId: string) {
    return this.roles.create(dto, actorId);
  }

  @Patch(':id')
  @RequirePermission('roles.manage')
  update(
    @Param() { id }: IdParamDto,
    @Body() dto: UpdateRoleDto,
    @GetUser('id') actorId: string,
  ) {
    return this.roles.update(id, dto, actorId);
  }

  @Delete(':id')
  @RequirePermission('roles.manage')
  @HttpCode(200)
  async remove(@Param() { id }: IdParamDto, @GetUser('id') actorId: string) {
    await this.roles.remove(id, actorId);
    return ResponseUtil.success(null, 'Role deleted');
  }
}
