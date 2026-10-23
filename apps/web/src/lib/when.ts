import type { Locale, OwnerRow, Reminder } from '@prime-crm/shared';
import type { RowUrgency } from '@/components/today/owner-row';
import type { Translate } from '@/i18n/translate';
import { sameCairoDay } from './cairo-time';
import { formatDate, lateness } from './format';

/**
 * The "when" line of a row and its urgency marker, from one `now` the server picks (so the first
 * paint and hydration agree).
 */

export function lateText(t: Translate, due: string, now: Date): string {
  const late = lateness(due, now);
  const key =
    late.unit === 'minutes'
      ? 'today.lateMinutes'
      : late.unit === 'hours'
        ? 'today.lateHours'
        : 'today.lateDays';
  return t(key, { n: late.value.toLocaleString('en-US') });
}

/** Overdue: how late; today: the time; later: the date and time. */
export function dueText(
  t: Translate,
  locale: Locale,
  due: string,
  now: Date,
): string {
  const at = new Date(due);
  if (at.getTime() < now.getTime()) return lateText(t, due, now);
  return sameCairoDay(at, now)
    ? t('today.dueAt', { time: formatDate(at, locale, 'time') })
    : formatDate(at, locale, 'dateTime');
}

export function reminderUrgency(reminder: Reminder, now: Date): RowUrgency {
  if (reminder.doneAt) return 'none';
  if (reminder.kind !== 'MANUAL') return 'checkIn';
  const at = new Date(reminder.dueAt);
  if (at.getTime() < now.getTime()) return 'overdue';
  return sameCairoDay(at, now) ? 'due' : 'none';
}

/** A calling-list owner: red with an overdue reminder, indigo with one later today. */
export function ownerUrgency(owner: OwnerRow, now: Date): RowUrgency {
  if (!owner.nextReminderAt) return 'none';
  const at = new Date(owner.nextReminderAt);
  if (at.getTime() < now.getTime()) return 'overdue';
  return sameCairoDay(at, now) ? 'due' : 'none';
}

export function ownerWhen(
  t: Translate,
  locale: Locale,
  owner: OwnerRow,
  now: Date,
): string {
  if (ownerUrgency(owner, now) !== 'none' && owner.nextReminderAt)
    return dueText(t, locale, owner.nextReminderAt, now);
  return owner.lastCall
    ? t('today.calledOn', {
        date: formatDate(owner.lastCall.at, locale, 'date'),
      })
    : t('today.neverCalled');
}
