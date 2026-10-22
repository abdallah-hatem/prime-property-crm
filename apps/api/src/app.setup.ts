import type { INestApplication } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { createValidationPipe } from './common/pipes/validation.pipe';
import type { Env } from './config/env.validation';

export const API_PREFIX = 'api';

/**
 * JSON body cap. Bulk bodies are the largest: `POST /owners/assign` takes up to 5000 UUIDs
 * (~200 KB), over Express's 100 KB default. Vercel caps a request at 4.5 MB anyway.
 */
export const JSON_BODY_LIMIT = '1mb';

/** App-level wiring shared by main.ts and the e2e tests, so both run the same app. */
export function configureApp(app: INestApplication): void {
  const config = app.get<ConfigService<Env, true>>(ConfigService);
  (app as NestExpressApplication).useBodyParser('json', {
    limit: JSON_BODY_LIMIT,
  });
  app.setGlobalPrefix(API_PREFIX);
  app.enableCors({
    origin: config.get('CORS_ORIGINS', { infer: true }),
    credentials: true,
  });
  app.useGlobalPipes(createValidationPipe());
  app.enableShutdownHooks();
}
