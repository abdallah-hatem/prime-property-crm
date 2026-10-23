'use client';

import { useId, useState } from 'react';
import { useRouter } from 'next/navigation';
import { LoaderCircle } from 'lucide-react';
import { NOTE_BODY_MAX_LENGTH, type Reminder } from '@prime-crm/shared';
import { CREATE_REMINDER, UPDATE_REMINDER } from '@/apis';
import {
  DateTimePicker,
  dateTimeInstant,
  EMPTY_DATE_TIME,
  type DateTimeValue,
} from '@/components/date-time-picker';
import { FormField } from '@/components/form-field';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';
import { useTranslation } from '@/i18n/i18n-provider';
import { isUnauthorized } from '@/lib/api-result';
import { cairoInstant, toCairo } from '@/lib/cairo-time';
import { callApi } from '@/lib/callApi';
import { errorMessage } from '@/lib/error-message';

export type ReminderDialogMode =
  { kind: 'create'; ownerId: string } | { kind: 'edit'; reminder: Reminder };

/**
 * New or edited reminder: Cairo date and time (never in the past) and a note. A take-down task's
 * time can't move, so only its note is offered.
 */
export function ReminderDialog({
  mode,
  open,
  onOpenChange,
}: {
  mode: ReminderDialogMode;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const { t } = useTranslation();
  const key = mode.kind === 'edit' ? mode.reminder.id : `new-${mode.ownerId}`;
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent variant="sheet" size="md" closeLabel={t('dialog.close')}>
        {open && (
          <ReminderForm
            key={key}
            mode={mode}
            onDone={() => onOpenChange(false)}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}

function ReminderForm({
  mode,
  onDone,
}: {
  mode: ReminderDialogMode;
  onDone: () => void;
}) {
  const { t } = useTranslation();
  const router = useRouter();
  const formId = useId();
  const editing = mode.kind === 'edit' ? mode.reminder : null;
  const timeLocked = editing?.kind === 'AD_TAKE_DOWN';
  const [due, setDue] = useState<DateTimeValue>(() =>
    editing ? toCairo(new Date(editing.dueAt)) : EMPTY_DATE_TIME,
  );
  const [note, setNote] = useState(editing?.note ?? '');
  const [errors, setErrors] = useState<{ due?: string; form?: string }>({});
  const [saving, setSaving] = useState(false);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (saving) return;
    const instant = dateTimeInstant(due);
    const dueChanged =
      !editing ||
      !instant ||
      instant.getTime() !== new Date(editing.dueAt).getTime();
    if (!timeLocked && dueChanged) {
      if (!instant) return setErrors({ due: t('reminders.dueRequired') });
      if (instant.getTime() <= Date.now())
        return setErrors({ due: t('picker.pastTime') });
    }
    setErrors({});
    setSaving(true);
    const trimmed = note.trim();
    const dueAt =
      !timeLocked && dueChanged && due.day && due.time
        ? cairoInstant(due.day, due.time)
        : undefined;
    try {
      const res = await callApi(
        editing
          ? UPDATE_REMINDER(editing.id, {
              ...(dueAt ? { dueAt } : {}),
              note: trimmed || null,
            })
          : CREATE_REMINDER({
              ownerId: mode.kind === 'create' ? mode.ownerId : undefined,
              dueAt,
              ...(trimmed ? { note: trimmed } : {}),
            }),
        {
          showErrorToast: false,
          showSuccessToast: true,
          successMessage: t('reminders.saved'),
        },
      );
      if (res.success) {
        router.refresh();
        return onDone();
      }
      if (isUnauthorized(res)) return;
      const message = errorMessage(t, res);
      setErrors(
        res.error === 'REMINDER_IN_PAST' ? { due: message } : { form: message },
      );
    } catch {
      setErrors({ form: t('error.network') });
    } finally {
      setSaving(false);
    }
  }

  const dueError = `${formId}-due-error`;
  return (
    <form
      noValidate
      onSubmit={(event) => void submit(event)}
      className="flex min-h-0 flex-1 flex-col"
    >
      <DialogHeader>
        <DialogTitle>
          {editing ? t('reminders.editTitle') : t('reminders.addTitle')}
        </DialogTitle>
      </DialogHeader>
      <DialogBody className="grid content-start gap-5 pb-4">
        {!timeLocked && (
          <div className="grid gap-2">
            <span className="type-label">
              {t('reminders.due')}
              <span aria-hidden="true" className="ms-0.5 text-destructive">
                *
              </span>
            </span>
            <DateTimePicker
              idPrefix={`${formId}-due`}
              value={due}
              invalid={!!errors.due}
              describedBy={errors.due ? dueError : undefined}
              onChange={(value) => {
                setDue(value);
                setErrors({});
              }}
            />
            {errors.due && (
              <p
                id={dueError}
                className="text-xs font-semibold text-destructive"
              >
                {errors.due}
              </p>
            )}
          </div>
        )}
        <FormField
          label={t('reminders.note')}
          hint={`${note.length.toLocaleString('en-US')} / ${NOTE_BODY_MAX_LENGTH.toLocaleString('en-US')}`}
        >
          {(field) => (
            <Textarea
              {...field}
              rows={3}
              value={note}
              maxLength={NOTE_BODY_MAX_LENGTH}
              disabled={saving}
              placeholder={t('reminders.notePlaceholder')}
              onChange={(event) => setNote(event.target.value)}
            />
          )}
        </FormField>
        {errors.form && (
          <p
            role="alert"
            className="rounded-md bg-destructive-soft px-4 py-3 text-sm font-semibold text-destructive"
          >
            {errors.form}
          </p>
        )}
      </DialogBody>
      <DialogFooter>
        <Button
          type="button"
          variant="secondary"
          disabled={saving}
          onClick={onDone}
        >
          {t('action.cancel')}
        </Button>
        <Button type="submit" disabled={saving}>
          {saving && <LoaderCircle aria-hidden className="animate-spin" />}
          {saving ? t('calling.saving') : t('reminders.save')}
        </Button>
      </DialogFooter>
    </form>
  );
}
