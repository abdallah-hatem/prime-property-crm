'use client';

import { useEffect, useId, useState } from 'react';
import { CircleAlert, LoaderCircle, Plus, X } from 'lucide-react';
import { NOTE_BODY_MAX_LENGTH, type CallOutcome } from '@prime-crm/shared';
import { GET_CALL_OUTCOMES, SET_CALL_OUTCOME } from '@/apis';
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
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Skeleton } from '@/components/ui/skeleton';
import { Textarea } from '@/components/ui/textarea';
import { useTranslation } from '@/i18n/i18n-provider';
import { isUnauthorized, type ApiResult } from '@/lib/api-result';
import { cairoInstant } from '@/lib/cairo-time';
import { callApi } from '@/lib/callApi';
import { errorMessage } from '@/lib/error-message';
import { formatDate, formatPhone } from '@/lib/format';
import { cn } from '@/lib/utils';

/** What the sheet needs to know about the call it records. */
export interface CallSummary {
  id: string;
  ownerName: string;
  phone: string;
  startedAt: string;
}

/** Outcomes change rarely: one load per page session, shared by every sheet. */
let outcomesRequest: Promise<ApiResult<CallOutcome[]>> | null = null;
function loadOutcomes(): Promise<ApiResult<CallOutcome[]>> {
  outcomesRequest ??= callApi(GET_CALL_OUTCOMES(), {
    showErrorToast: false,
  }).then((res) => {
    if (!res.success) outcomesRequest = null;
    return res;
  });
  return outcomesRequest;
}
/** Tests start each case with an empty cache. */
export function resetOutcomesCache(): void {
  outcomesRequest = null;
}

type Outcomes =
  | { state: 'loading' }
  | { state: 'error' }
  | { state: 'ready'; items: CallOutcome[] };

interface Errors {
  outcome?: string;
  reminder?: string;
  form?: string;
}

/**
 * After the call: outcome (required, in the reader's language), a note, and an optional reminder
 * that can't be in the past. A bottom sheet on phones, a dialog from md up. "Later" keeps the call
 * in Today's Outcome missing.
 */
export function OutcomeSheet({
  call,
  open,
  onOpenChange,
}: {
  call: CallSummary | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const { t } = useTranslation();
  return (
    <Dialog
      open={open && call !== null}
      onOpenChange={(next) => !next && onOpenChange(false)}
    >
      <DialogContent
        variant="sheet"
        size="md"
        closeLabel={t('dialog.close')}
        data-testid="outcome-sheet"
      >
        {call && (
          // Keyed by call: a new call always starts from an empty form.
          <OutcomeForm
            key={call.id}
            call={call}
            onDone={() => onOpenChange(false)}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}

function OutcomeForm({
  call,
  onDone,
}: {
  call: CallSummary;
  onDone: () => void;
}) {
  const { t, locale } = useTranslation();
  const formId = useId();
  const [outcomes, setOutcomes] = useState<Outcomes>({ state: 'loading' });
  const [attempt, setAttempt] = useState(0);
  const [outcomeId, setOutcomeId] = useState<string | null>(null);
  const [note, setNote] = useState('');
  const [withReminder, setWithReminder] = useState(false);
  const [reminder, setReminder] = useState<DateTimeValue>(EMPTY_DATE_TIME);
  const [errors, setErrors] = useState<Errors>({});
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let live = true;
    void loadOutcomes().then((res) => {
      if (!live) return;
      setOutcomes(
        res.success
          ? { state: 'ready', items: res.data.filter((o) => !o.hidden) }
          : { state: 'error' },
      );
    });
    return () => {
      live = false;
    };
  }, [attempt]);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (saving) return;
    const next: Errors = {};
    if (!outcomeId) next.outcome = t('calling.outcomeRequired');
    let dueAt: string | undefined;
    if (withReminder) {
      const instant = dateTimeInstant(reminder);
      if (!instant || !reminder.day || !reminder.time)
        next.reminder = t('reminders.dueRequired');
      else if (instant.getTime() <= Date.now())
        next.reminder = t('picker.pastTime');
      else dueAt = cairoInstant(reminder.day, reminder.time);
    }
    setErrors(next);
    if (next.outcome || next.reminder || !outcomeId) return;

    setSaving(true);
    try {
      const trimmed = note.trim();
      const res = await callApi(
        SET_CALL_OUTCOME(call.id, {
          outcomeId,
          ...(trimmed ? { note: trimmed } : {}),
          ...(dueAt ? { reminder: { dueAt } } : {}),
        }),
        {
          showErrorToast: false,
          showSuccessToast: true,
          successMessage: t('calling.saved'),
        },
      );
      if (res.success) return onDone();
      if (isUnauthorized(res)) return;
      if (res.error === 'OUTCOME_ALREADY_SET') return onDone();
      const message = errorMessage(t, res);
      if (res.error === 'REMINDER_IN_PAST') setErrors({ reminder: message });
      else if (res.error === 'OUTCOME_HIDDEN') {
        setErrors({ outcome: message });
        setOutcomeId(null);
        resetOutcomesCache();
        setAttempt((n) => n + 1);
      } else setErrors({ form: message });
    } catch {
      setErrors({ form: t('error.network') });
    } finally {
      setSaving(false);
    }
  }

  const started = new Date(call.startedAt);
  const outcomeError = `${formId}-outcome-error`;
  const reminderError = `${formId}-reminder-error`;

  return (
    <form
      noValidate
      onSubmit={(event) => void submit(event)}
      aria-busy={saving || undefined}
      className="flex min-h-0 flex-1 flex-col"
    >
      <DialogHeader>
        <DialogTitle>{t('calling.outcomeTitle')}</DialogTitle>
        <DialogDescription className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-0.5">
          <span className="min-w-0 truncate font-semibold text-foreground">
            {call.ownerName}
          </span>
          <bdi dir="ltr" className="font-numeric tabular-nums">
            {formatPhone(call.phone)}
          </bdi>
          <span className="font-numeric">
            {formatDate(started, locale, 'time')}
          </span>
        </DialogDescription>
      </DialogHeader>
      <DialogBody className="grid content-start gap-5 pb-4">
        <fieldset className="grid gap-2.5">
          <legend className="mb-2.5 type-label">
            {t('calling.outcome')}
            <span aria-hidden="true" className="ms-0.5 text-destructive">
              *
            </span>
          </legend>
          {outcomes.state === 'loading' && (
            <div
              role="status"
              aria-label={t('calling.loadingOutcomes')}
              className="grid grid-cols-2 gap-2"
            >
              {Array.from({ length: 10 }, (_, i) => (
                <Skeleton key={i} className="h-11 rounded-pill" />
              ))}
            </div>
          )}
          {outcomes.state === 'error' && (
            <div className="flex flex-wrap items-center gap-3 rounded-md bg-destructive-soft px-4 py-3 text-sm text-destructive">
              <span className="flex-1">{t('calling.outcomesError')}</span>
              <Button
                type="button"
                variant="secondary"
                size="sm"
                onClick={() => {
                  setOutcomes({ state: 'loading' });
                  setAttempt((n) => n + 1);
                }}
              >
                {t('action.retry')}
              </Button>
            </div>
          )}
          {outcomes.state === 'ready' && outcomes.items.length === 0 && (
            <p className="rounded-md bg-secondary px-4 py-3 text-sm text-muted-foreground">
              {t('calling.outcomesEmpty')}
            </p>
          )}
          {outcomes.state === 'ready' && outcomes.items.length > 0 && (
            <div
              role="radiogroup"
              aria-required="true"
              aria-invalid={errors.outcome ? true : undefined}
              aria-describedby={errors.outcome ? outcomeError : undefined}
              className="grid grid-cols-2 gap-2"
            >
              {outcomes.items.map((outcome) => {
                const selected = outcome.id === outcomeId;
                return (
                  <button
                    key={outcome.id}
                    type="button"
                    role="radio"
                    aria-checked={selected}
                    disabled={saving}
                    onClick={() => {
                      setOutcomeId(outcome.id);
                      setErrors((e) => ({ ...e, outcome: undefined }));
                    }}
                    className={cn(
                      'min-h-11 cursor-pointer rounded-pill px-3 py-2 text-center text-sm leading-tight font-semibold break-words',
                      'transition-[background-color,color,box-shadow] duration-200 ease-snappy',
                      'focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-ring disabled:cursor-not-allowed',
                      selected
                        ? 'bg-primary text-primary-foreground shadow-glow'
                        : 'bg-secondary text-secondary-foreground hover:bg-accent hover:text-accent-foreground',
                    )}
                  >
                    {locale === 'ar' ? outcome.labelAr : outcome.labelEn}
                  </button>
                );
              })}
            </div>
          )}
          {errors.outcome && (
            <p
              id={outcomeError}
              className="text-xs font-semibold text-destructive"
            >
              {errors.outcome}
            </p>
          )}
        </fieldset>

        <FormField
          label={t('calling.note')}
          hint={`${note.length.toLocaleString('en-US')} / ${NOTE_BODY_MAX_LENGTH.toLocaleString('en-US')}`}
        >
          {(field) => (
            <Textarea
              {...field}
              rows={3}
              value={note}
              maxLength={NOTE_BODY_MAX_LENGTH}
              disabled={saving}
              placeholder={t('calling.notePlaceholder')}
              onChange={(event) => setNote(event.target.value)}
            />
          )}
        </FormField>

        {withReminder ? (
          <div className="grid gap-2">
            <div className="flex items-center justify-between gap-2">
              <span className="type-label">{t('calling.reminder')}</span>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                disabled={saving}
                onClick={() => {
                  setWithReminder(false);
                  setReminder(EMPTY_DATE_TIME);
                  setErrors((e) => ({ ...e, reminder: undefined }));
                }}
              >
                <X aria-hidden />
                {t('calling.removeReminder')}
              </Button>
            </div>
            <DateTimePicker
              idPrefix={`${formId}-reminder`}
              value={reminder}
              invalid={!!errors.reminder}
              describedBy={errors.reminder ? reminderError : undefined}
              onChange={(value) => {
                setReminder(value);
                setErrors((e) => ({ ...e, reminder: undefined }));
              }}
            />
            {errors.reminder && (
              <p
                id={reminderError}
                className="text-xs font-semibold text-destructive"
              >
                {errors.reminder}
              </p>
            )}
          </div>
        ) : (
          <Button
            type="button"
            variant="soft"
            className="justify-self-start"
            disabled={saving}
            onClick={() => setWithReminder(true)}
          >
            <Plus aria-hidden />
            {t('calling.addReminder')}
          </Button>
        )}

        {errors.form && (
          <p
            role="alert"
            className="flex items-start gap-2 rounded-md bg-destructive-soft px-4 py-3 text-sm font-semibold text-destructive"
          >
            <CircleAlert aria-hidden className="mt-0.5 size-4 shrink-0" />
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
          {t('calling.later')}
        </Button>
        <Button
          type="submit"
          disabled={saving || outcomes.state !== 'ready'}
          data-testid="outcome-save"
        >
          {saving && <LoaderCircle aria-hidden className="animate-spin" />}
          {saving ? t('calling.saving') : t('calling.save')}
        </Button>
      </DialogFooter>
    </form>
  );
}
