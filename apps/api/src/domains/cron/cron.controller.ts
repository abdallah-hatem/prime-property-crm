import { Controller, Get, HttpCode, Post, UseGuards } from '@nestjs/common';
import { Public } from '../../common/decorators/public.decorator';
import { CronSecretGuard } from './cron-secret.guard';
import { CronService } from './cron.service';

/**
 * Scheduled jobs, called by Vercel cron with GET (POST too, for a manual run). No user token:
 * `Authorization: Bearer <CRON_SECRET>` instead, refused when the secret is unset.
 */
@Controller('internal/cron')
@Public()
@UseGuards(CronSecretGuard)
export class CronController {
  constructor(private readonly cron: CronService) {}

  @Get('purge')
  purgeByVercel() {
    return this.cron.purge();
  }

  @Post('purge')
  @HttpCode(200)
  purge() {
    return this.cron.purge();
  }

  @Get('ad-check-ins')
  adCheckInsByVercel() {
    return this.cron.adCheckIns();
  }

  @Post('ad-check-ins')
  @HttpCode(200)
  adCheckIns() {
    return this.cron.adCheckIns();
  }
}
