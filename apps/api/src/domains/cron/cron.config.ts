import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Env } from '../../config/env.validation';

/** The shared secret Vercel crons send (`Authorization: Bearer <CRON_SECRET>`). Tests replace it. */
@Injectable()
export class CronConfig {
  constructor(private readonly config: ConfigService<Env, true>) {}

  /** Undefined when unset: the cron endpoints then refuse every call. */
  secret(): string | undefined {
    return this.config.get('CRON_SECRET', { infer: true });
  }
}
