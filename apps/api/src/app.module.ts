import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_FILTER, APP_GUARD, APP_INTERCEPTOR } from '@nestjs/core';
import { CommonModule } from './common/common.module';
import { AllExceptionsFilter } from './common/filters/all-exceptions.filter';
import { JwtAuthGuard } from './common/guards/jwt-auth.guard';
import { PermissionsGuard } from './common/guards/permissions.guard';
import { ResponseInterceptor } from './common/interceptors/response.interceptor';
import { validateEnv } from './config/env.validation';
import { DatabaseModule } from './database/database.module';
import { ActivityModule } from './domains/activity/activity.module';
import { AuthModule } from './domains/auth/auth.module';
import { HealthModule } from './domains/health/health.module';
import { TrashModule } from './domains/trash/trash.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      cache: true,
      validate: validateEnv,
    }),
    DatabaseModule,
    CommonModule,
    AuthModule,
    HealthModule,
    ActivityModule,
    TrashModule,
  ],
  providers: [
    { provide: APP_INTERCEPTOR, useClass: ResponseInterceptor },
    { provide: APP_FILTER, useClass: AllExceptionsFilter },
    // Guards run in this order: token first (401), then permissions (403).
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_GUARD, useClass: PermissionsGuard },
  ],
})
export class AppModule {}
