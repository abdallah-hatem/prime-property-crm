import { Injectable } from '@nestjs/common';
import { TODAY_LIST_MAX, type Today } from '@prime-crm/shared';
import { CallsService } from '../calls/calls.service';
import { RemindersService } from '../reminders/reminders.service';

/** The caller's day: calls waiting for an outcome, reminders overdue and due today, ad tasks. */
@Injectable()
export class MeService {
  constructor(
    private readonly calls: CallsService,
    private readonly reminders: RemindersService,
  ) {}

  async today(userId: string): Promise<Today> {
    const [calls, reminders] = await Promise.all([
      this.calls.today(userId, TODAY_LIST_MAX),
      this.reminders.today(userId),
    ]);
    return {
      outcomeMissing: calls.outcomeMissing,
      overdue: reminders.overdue,
      dueToday: reminders.dueToday,
      adTasks: reminders.adTasks,
      counts: {
        overdue: reminders.counts.overdue,
        dueToday: reminders.counts.dueToday,
        outcomeMissing: calls.outcomeMissingTotal,
        adTasks: reminders.counts.adTasks,
        callsToday: calls.callsToday,
        remindersOpen: reminders.counts.remindersOpen,
      },
    };
  }
}
