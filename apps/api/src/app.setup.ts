import type { INestApplication } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createValidationPipe } from './common/pipes/validation.pipe';
import type { Env } from './config/env.validation';

export const API_PREFIX = 'api';

/** App-level wiring shared by main.ts and the e2e tests, so both run the same app. */
export function configureApp(app: INestApplication): void {
  const config = app.get<ConfigService<Env, true>>(ConfigService);
  app.setGlobalPrefix(API_PREFIX);
  app.enableCors({
    origin: config.get('CORS_ORIGINS', { infer: true }),
    credentials: true,
  });
  app.useGlobalPipes(createValidationPipe());
  app.enableShutdownHooks();
}
