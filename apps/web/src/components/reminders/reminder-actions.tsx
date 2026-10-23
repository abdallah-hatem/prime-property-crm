'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Check, LoaderCircle, Pencil } from 'lucide-react';
import type { Reminder } from '@prime-crm/shared';
import { MARK_REMINDER_DONE } from '@/apis';
import { useSession } from '@/components/session-provider';
import { Button } from '@/components/ui/button';
import { useTranslation } from '@/i18n/i18n-provider';
import { callApi } from '@/lib/callApi';
import { ReminderDialog } from './reminder-dialog';

/** Why a system reminder has no Done button: it closes through its listing. */
export function systemReason(
  reminder: Reminder,
  t: ReturnType<typeof useTranslation>['t'],
): string | null {
  if (reminder.kind === 'AD_CHECK_IN') return t('reminders.systemCheckIn');
  if (reminder.kind === 'AD_TAKE_DOWN') return t('reminders.systemTakeDown');
  return null;
}

/**
 * Done and Edit for an open reminder its member owns. A system reminder (ad check-in, take-down)
 * shows why it can't be marked done here instead of a Done button.
 */
export function ReminderActions({
  reminder,
  layout = 'row',
}: {
  reminder: Reminder;
  layout?: 'row' | 'inline';
}) {
  const { t } = useTranslation();
  const me = useSession();
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [refreshing, startRefresh] = useTransition();
  const [editing, setEditing] = useState(false);

  if (reminder.doneAt || !me || reminder.member?.id !== me.id) return null;
  const reason = systemReason(reminder, t);
  const working = busy || refreshing;
  const name = reminder.owner?.name ?? reminder.listing?.title ?? '';

  async function markDone() {
    if (working) return;
    setBusy(true);
    try {
      const res = await callApi(MARK_REMINDER_DONE(reminder.id), {
        showSuccessToast: true,
        successMessage: t('reminders.markedDone'),
      });
      if (res.success) startRefresh(() => router.refresh());
    } catch {
      // Offline: the button frees up for another try.
    } finally {
      setBusy(false);
    }
  }

  return (
    <div
      className={
        layout === 'row'
          ? 'flex shrink-0 items-center gap-1'
          : 'flex min-w-0 items-center justify-end gap-1'
      }
    >
      {reason ? (
        // On a phone card the reason is the row's second line (ReminderRow), so the title keeps
        // its width; in a table it fills the actions cell and wraps inside it.
        layout === 'inline' && (
          <p className="min-w-0 flex-1 text-end text-xs leading-snug text-muted-foreground">
            {reason}
          </p>
        )
      ) : (
        <Button
          variant="soft"
          className="h-11"
          disabled={working}
          aria-label={t('reminders.markDoneName', { name })}
          onClick={() => void markDone()}
        >
          {working ? (
            <LoaderCircle aria-hidden className="animate-spin" />
          ) : (
            <Check aria-hidden />
          )}
          {t('reminders.markDone')}
        </Button>
      )}
      <Button
        variant="ghost"
        size={layout === 'row' ? 'icon' : 'sm'}
        className={layout === 'row' ? undefined : 'h-11 shrink-0'}
        aria-label={layout === 'row' ? t('reminders.edit') : undefined}
        disabled={working}
        onClick={() => setEditing(true)}
      >
        <Pencil aria-hidden />
        {layout === 'inline' && t('reminders.edit')}
      </Button>
      <ReminderDialog
        mode={{ kind: 'edit', reminder }}
        open={editing}
        onOpenChange={setEditing}
      />
    </div>
  );
}
