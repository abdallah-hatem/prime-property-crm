import { Controller, Get, HttpCode, Param, Post, Query } from '@nestjs/common';
import { GetUser } from '../../common/decorators/get-user.decorator';
import { RequirePermission } from '../../common/decorators/require-permission.decorator';
import type { CurrentUser } from '../../common/interfaces/current-user.interface';
import { ResponseUtil } from '../../common/utils/response.util';
import { TrashItemParamsDto, TrashQueryDto } from './dto/trash-query.dto';
import { TrashService } from './trash.service';

@Controller('trash')
@RequirePermission('trash.restore')
export class TrashController {
  constructor(private readonly trash: TrashService) {}

  @Get()
  async list(@Query() query: TrashQueryDto, @GetUser('id') userId: string) {
    return ResponseUtil.paginated(await this.trash.list(query, userId));
  }

  @Post(':kind/:id/restore')
  @HttpCode(200)
  async restore(
    @Param() { kind, id }: TrashItemParamsDto,
    @GetUser() user: CurrentUser,
  ) {
    await this.trash.restore(kind, id, user);
    return ResponseUtil.success(null, 'Restored');
  }
}
