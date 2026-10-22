import { Module } from '@nestjs/common';
import { UploadsModule } from '../uploads/uploads.module';
import { BlobFilesGateway } from './blob-files.gateway';
import { CronSecretGuard } from './cron-secret.guard';
import { CronConfig } from './cron.config';
import { CronController } from './cron.controller';
import { CronService } from './cron.service';
import { CronRepository } from './repositories/cron.repository';

/** `/internal/cron/purge` and `/internal/cron/ad-check-ins` (Vercel cron, CRON_SECRET). */
@Module({
  imports: [UploadsModule],
  controllers: [CronController],
  providers: [
    CronService,
    CronRepository,
    CronConfig,
    CronSecretGuard,
    BlobFilesGateway,
  ],
})
export class CronModule {}
