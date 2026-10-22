import { Body, Controller, Get, Patch } from '@nestjs/common';
import { GetUser } from '../../common/decorators/get-user.decorator';
import { RequirePermission } from '../../common/decorators/require-permission.decorator';
import { UpdateSettingsDto } from './dto/update-settings.dto';
import { SettingsService } from './settings.service';

/** `GET /settings` (any signed-in user) and `PATCH /settings` (settings.manage). */
@Controller('settings')
export class SettingsController {
  constructor(private readonly settings: SettingsService) {}

  @Get()
  get() {
    return this.settings.get();
  }

  @Patch()
  @RequirePermission('settings.manage')
  update(@Body() dto: UpdateSettingsDto, @GetUser('id') actorId: string) {
    return this.settings.update(dto, actorId);
  }
}
