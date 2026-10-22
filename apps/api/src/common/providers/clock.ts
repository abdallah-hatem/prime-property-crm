import { Injectable } from '@nestjs/common';

/**
 * The current time, injected so time-boundary rules (the 30-day trash window, "today" in
 * Cairo) can be tested at the exact boundary. Services call `clock.now()`, never `new Date()`.
 */
@Injectable()
export class Clock {
  now(): Date {
    return new Date();
  }
}
