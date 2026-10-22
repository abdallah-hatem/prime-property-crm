import { Controller, Get } from '@nestjs/common';
import { GetUser } from '../../common/decorators/get-user.decorator';
import { MeService } from './me.service';

@Controller('me')
export class MeController {
  constructor(private readonly me: MeService) {}

  @Get('today')
  today(@GetUser('id') userId: string) {
    return this.me.today(userId);
  }
}
