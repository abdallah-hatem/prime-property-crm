import { Module } from '@nestjs/common';
import { CallsModule } from '../calls/calls.module';
import { RemindersModule } from '../reminders/reminders.module';
import { MeController } from './me.controller';
import { MeService } from './me.service';

/** `GET /me/today`. */
@Module({
  imports: [CallsModule, RemindersModule],
  controllers: [MeController],
  providers: [MeService],
})
export class MeModule {}
