'use client';

import type { Reminder } from '@prime-crm/shared';
import { OwnerRow } from '@/components/today/owner-row';
import { Badge } from '@/components/ui/badge';
import { useTranslation } from '@/i18n/i18n-provider';
import { formatDate } from '@/lib/format';
import { dueText, reminderUrgency } from '@/lib/when';

/** Where a reminder's row leads: its owner, or its listing. */
export const reminderHref = (reminder: Reminder): string | undefined =>
  reminder.owner
    ? `/owners/${reminder.owner.id}`
    : reminder.listing
      ? `/listings/${reminder.listing.id}`
      : undefined;

/**
 * A reminder as a calling-list row: whose it is (owner name, or the ad task on a listing), its
 * note, and when (how late, today's time, or the date). The action is the caller's: Call on
 * Today, Done on the reminders page.
 */
export function ReminderRow({
  reminder,
  now,
  action,
}: {
  reminder: Reminder;
  now: Date;
  action?: React.ReactNode;
}) {
  const { t, locale } = useTranslation();
  const listingTitle = reminder.listing?.title ?? '';
  const name =
    reminder.kind === 'AD_CHECK_IN'
      ? t('today.adCheckIn', { title: listingTitle })
      : reminder.kind === 'AD_TAKE_DOWN'
        ? t('today.adTakeDown', { title: listingTitle })
        : (reminder.owner?.name ?? listingTitle);
  const when = reminder.doneAt
    ? t('reminders.doneOn', {
        date: formatDate(reminder.doneAt, locale, 'dateTime'),
      })
    : dueText(t, locale, reminder.dueAt, now);

  return (
    <OwnerRow
      urgency={reminderUrgency(reminder, now)}
      name={name}
      href={reminderHref(reminder)}
      detail={reminder.note}
      detailIcon="note"
      status={
        reminder.doneAt ? (
          <Badge variant="success">{t('reminders.done')}</Badge>
        ) : undefined
      }
      when={when}
      action={action}
    />
  );
}
