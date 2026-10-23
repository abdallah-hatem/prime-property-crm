/** The reminders page's "Show" filter: open (all), by when they're due, or done. */
export const REMINDER_FILTERS = [
  'open',
  'overdue',
  'today',
  'upcoming',
  'done',
] as const;
export type ReminderFilter = (typeof REMINDER_FILTERS)[number];

export const isReminderFilter = (value: unknown): value is ReminderFilter =>
  typeof value === 'string' &&
  (REMINDER_FILTERS as readonly string[]).includes(value);
