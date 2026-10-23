'use client';

import { useMemo, useState, useTransition } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  ArrowLeft,
  Ban,
  BellPlus,
  Building2,
  LoaderCircle,
  MapPin,
  Phone,
  PhoneCall,
  RotateCcw,
  StickyNote,
  UserRound,
  UsersRound,
  type LucideIcon,
} from 'lucide-react';
import {
  NOTE_BODY_MAX_LENGTH,
  type Owner,
  type OwnerTimelineItem,
  type Reminder,
} from '@prime-crm/shared';
import { ADD_OWNER_NOTE, SET_OWNER_DO_NOT_CALL } from '@/apis';
import { useCallFlow } from '@/components/calling/call-flow';
import { CallButton } from '@/components/calling/call-button';
import { ConfirmDialog } from '@/components/confirm-dialog';
import { DateText } from '@/components/date-text';
import { FormField } from '@/components/form-field';
import { ReminderActions } from '@/components/reminders/reminder-actions';
import { ReminderDialog } from '@/components/reminders/reminder-dialog';
import { useSession } from '@/components/session-provider';
import { StatusChip } from '@/components/status-chip';
import { SectionHeading } from '@/components/today/section-heading';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { useTranslation } from '@/i18n/i18n-provider';
import { isUnauthorized } from '@/lib/api-result';
import { callApi } from '@/lib/callApi';
import { errorMessage } from '@/lib/error-message';
import { formatDate, formatPhone } from '@/lib/format';
import { cn } from '@/lib/utils';
import { dueText, reminderUrgency } from '@/lib/when';

/** Open first by due time, then done ones, newest done first (the API's reminder order). */
function remindersOf(timeline: OwnerTimelineItem[]): Reminder[] {
  const reminders = timeline.flatMap((item) =>
    item.kind === 'REMINDER' ? [item.reminder] : [],
  );
  const open = reminders
    .filter((r) => !r.doneAt)
    .sort((a, b) => a.dueAt.localeCompare(b.dueAt));
  const done = reminders
    .filter((r) => r.doneAt)
    .sort((a, b) => (b.doneAt ?? '').localeCompare(a.doneAt ?? ''));
  return [...open, ...done];
}

const card = 'grid gap-3 rounded-lg bg-card p-4 shadow-raised md:p-5';

/**
 * One owner: who and where, phones (each one calls), status and member, Do not call, notes,
 * reminders and the full history. The member works it; someone with owners.viewAll can read it,
 * add notes and clear Do not call.
 */
export function OwnerDetail({
  owner,
  timeline,
  now: nowIso,
}: {
  owner: Owner;
  timeline: OwnerTimelineItem[];
  now: string;
}) {
  const { t, locale } = useTranslation();
  const me = useSession();
  const router = useRouter();
  const { startCall, busyOwnerId } = useCallFlow();
  const now = useMemo(() => new Date(nowIso), [nowIso]);
  const [refreshing, startRefresh] = useTransition();
  const [dncOpen, setDncOpen] = useState(false);
  const [reminderOpen, setReminderOpen] = useState(false);

  const viewAll = me?.permissions.includes('owners.viewAll') ?? false;
  const mine = !!me && owner.assignedTo?.id === me.id;
  const callable =
    mine && owner.status !== 'LISTED' && owner.status !== 'DO_NOT_CALL';
  const dnc = owner.status === 'DO_NOT_CALL';
  const canSetDnc = !dnc && owner.status !== 'LISTED' && (mine || viewAll);
  const canClearDnc = dnc && viewAll;
  const reminders = remindersOf(timeline);
  const notes = timeline.flatMap((item) =>
    item.kind === 'NOTE' ? [item.note] : [],
  );
  const shownNotes = notes.length > 0 ? notes : owner.notes;

  const hint = !owner.assignedTo
    ? t('owners.unassignedHint')
    : owner.status === 'LISTED'
      ? t('owners.listedHint')
      : dnc
        ? t('owners.doNotCallHint')
        : !mine
          ? t('owners.notYours', { name: owner.assignedTo.name })
          : null;

  async function toggleDnc(): Promise<boolean> {
    const res = await callApi(SET_OWNER_DO_NOT_CALL(owner.id, !dnc), {
      showSuccessToast: true,
      successMessage: dnc
        ? t('owners.clearDoNotCallDone')
        : t('owners.doNotCallDone'),
    });
    if (!res.success) return false;
    startRefresh(() => router.refresh());
    return true;
  }

  return (
    <div
      className={cn(
        'grid gap-5',
        refreshing && 'opacity-70 transition-opacity',
      )}
    >
      <Button
        asChild
        variant="ghost"
        size="sm"
        className="h-11 justify-self-start ps-2"
      >
        <Link href="/owners">
          <ArrowLeft aria-hidden className="flip-rtl" />
          {t('owners.back')}
        </Link>
      </Button>

      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] lg:items-start">
        <div className="grid min-w-0 gap-5">
          {/* Who */}
          <section className={cn(card, 'gap-4')} aria-labelledby="owner-name">
            <div className="grid gap-2">
              <h1 id="owner-name" className="type-h1 break-words">
                {owner.name}
              </h1>
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 text-sm text-muted-foreground">
                <StatusChip kind="lead" status={owner.status} />
                <span className="flex min-w-0 items-center gap-1.5">
                  <MapPin aria-hidden className="size-4 shrink-0" />
                  <span className="truncate">
                    {owner.area ?? t('owners.noArea')}
                  </span>
                </span>
                <span className="flex min-w-0 items-center gap-1.5">
                  <UserRound aria-hidden className="size-4 shrink-0" />
                  <span className="truncate">
                    {owner.assignedTo?.name ?? t('owners.unassigned')}
                  </span>
                </span>
              </div>
              {owner.source && (
                <p className="text-xs break-all text-muted-foreground">
                  {t('owners.importedFrom', { file: owner.source.fileName })}
                </p>
              )}
            </div>
            {hint && (
              <p className="rounded-md bg-secondary px-4 py-3 text-sm text-muted-foreground">
                {hint}
              </p>
            )}
            {callable && (
              <CallButton target={owner} size="dock" className="w-full" />
            )}
            <div className="flex flex-wrap gap-2">
              {owner.status === 'INTERESTED' && (mine || viewAll) && (
                <Button asChild variant="soft">
                  <Link href={`/listings/new?ownerId=${owner.id}`}>
                    <Building2 aria-hidden />
                    {t('owners.createListing')}
                  </Link>
                </Button>
              )}
              {canSetDnc && (
                <Button variant="secondary" onClick={() => setDncOpen(true)}>
                  <Ban aria-hidden />
                  {t('owners.doNotCall')}
                </Button>
              )}
              {canClearDnc && (
                <Button variant="secondary" onClick={() => setDncOpen(true)}>
                  <RotateCcw aria-hidden />
                  {t('owners.clearDoNotCall')}
                </Button>
              )}
            </div>
          </section>

          {/* Phones */}
          <section className={card} aria-labelledby="owner-phones">
            <SectionHeading
              id="owner-phones"
              title={t('owners.phones')}
              count={owner.phones.length}
            />
            <ul className="grid gap-2">
              {owner.phones.map((phone) => {
                const label = (
                  <bdi
                    dir="ltr"
                    className="font-numeric text-base font-bold tabular-nums"
                  >
                    {formatPhone(phone)}
                  </bdi>
                );
                return (
                  <li key={phone}>
                    {callable ? (
                      <button
                        type="button"
                        disabled={busyOwnerId !== null}
                        aria-label={t('owners.callNumber', {
                          phone: formatPhone(phone),
                        })}
                        onClick={() => startCall(owner, phone)}
                        className="flex h-13 w-full cursor-pointer items-center gap-3 rounded-md bg-secondary px-4 text-start transition-colors duration-150 hover:bg-accent active:bg-accent disabled:cursor-not-allowed disabled:opacity-60"
                      >
                        <PhoneCall
                          aria-hidden
                          className="size-4 text-primary"
                        />
                        {label}
                      </button>
                    ) : (
                      <div className="flex h-13 items-center gap-3 rounded-md bg-secondary px-4">
                        <Phone
                          aria-hidden
                          className="size-4 text-muted-foreground"
                        />
                        {label}
                      </div>
                    )}
                  </li>
                );
              })}
            </ul>
          </section>

          {/* Reminders */}
          <section className={card} aria-labelledby="owner-reminders">
            <SectionHeading
              id="owner-reminders"
              title={t('owners.reminders')}
              count={reminders.filter((r) => !r.doneAt).length}
              action={
                mine && owner.status !== 'LISTED' ? (
                  <Button
                    variant="soft"
                    size="sm"
                    className="h-11"
                    onClick={() => setReminderOpen(true)}
                  >
                    <BellPlus aria-hidden />
                    {t('owners.addReminder')}
                  </Button>
                ) : undefined
              }
            />
            {reminders.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                {t('owners.remindersEmpty')}
              </p>
            ) : (
              <ul className="grid gap-2">
                {reminders.map((reminder) => {
                  const urgency = reminderUrgency(reminder, now);
                  return (
                    <li
                      key={reminder.id}
                      className={cn(
                        'grid gap-2 rounded-md bg-secondary p-3',
                        reminder.doneAt && 'opacity-70',
                      )}
                    >
                      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
                        <span
                          className={cn(
                            'text-sm font-bold',
                            urgency === 'overdue' && 'text-destructive',
                          )}
                        >
                          {reminder.doneAt
                            ? t('reminders.doneOn', {
                                date: formatDate(
                                  reminder.doneAt,
                                  locale,
                                  'dateTime',
                                ),
                              })
                            : dueText(t, locale, reminder.dueAt, now)}
                        </span>
                        <DateText
                          value={reminder.dueAt}
                          style="dateTime"
                          className="text-xs text-muted-foreground"
                        />
                      </div>
                      {reminder.note && (
                        <p
                          dir="auto"
                          className="text-sm break-words whitespace-pre-line"
                        >
                          {reminder.note}
                        </p>
                      )}
                      <ReminderActions reminder={reminder} layout="inline" />
                    </li>
                  );
                })}
              </ul>
            )}
          </section>
        </div>

        <div className="grid min-w-0 gap-5">
          {/* Notes */}
          <section className={card} aria-labelledby="owner-notes">
            <SectionHeading
              id="owner-notes"
              title={t('owners.notes')}
              count={shownNotes.length}
            />
            {(mine || viewAll) && (
              <NoteForm
                ownerId={owner.id}
                onAdded={() => startRefresh(() => router.refresh())}
              />
            )}
            {shownNotes.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                {t('owners.notesEmpty')}
              </p>
            ) : (
              <ul className="grid gap-2">
                {shownNotes.map((note) => (
                  <li
                    key={note.id}
                    className="grid gap-1 rounded-md bg-secondary p-3"
                  >
                    <p
                      dir="auto"
                      className="text-sm break-words whitespace-pre-line"
                    >
                      {note.body}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {note.author.name}
                      {', '}
                      <DateText value={note.createdAt} style="dateTime" />
                    </p>
                  </li>
                ))}
              </ul>
            )}
          </section>

          {/* History */}
          <section className={card} aria-labelledby="owner-history">
            <SectionHeading
              id="owner-history"
              title={t('owners.timeline')}
              count={timeline.length}
            />
            {timeline.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                {t('owners.timelineEmpty')}
              </p>
            ) : (
              <ol className="grid">
                {timeline.map((item, index) => (
                  <TimelineEntry
                    key={`${item.kind}-${item.at}-${index}`}
                    item={item}
                    last={index === timeline.length - 1}
                  />
                ))}
              </ol>
            )}
          </section>
        </div>
      </div>

      <ConfirmDialog
        open={dncOpen}
        onOpenChange={setDncOpen}
        title={
          dnc
            ? t('owners.clearDoNotCallTitle', { name: owner.name })
            : t('owners.doNotCallTitle', { name: owner.name })
        }
        description={
          dnc ? t('owners.clearDoNotCallBody') : t('owners.doNotCallBody')
        }
        confirmLabel={dnc ? t('owners.clearDoNotCall') : t('owners.doNotCall')}
        destructive={!dnc}
        onConfirm={toggleDnc}
      />
      <ReminderDialog
        mode={{ kind: 'create', ownerId: owner.id }}
        open={reminderOpen}
        onOpenChange={setReminderOpen}
      />
    </div>
  );
}

function NoteForm({
  ownerId,
  onAdded,
}: {
  ownerId: string;
  onAdded: () => void;
}) {
  const { t } = useTranslation();
  const [body, setBody] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (saving) return;
    const trimmed = body.trim();
    if (!trimmed) return setError(t('owners.noteRequired'));
    setError(null);
    setSaving(true);
    try {
      const res = await callApi(ADD_OWNER_NOTE(ownerId, { body: trimmed }), {
        showErrorToast: false,
        showSuccessToast: true,
        successMessage: t('owners.noteSaved'),
      });
      if (res.success) {
        setBody('');
        onAdded();
      } else if (!isUnauthorized(res)) setError(errorMessage(t, res));
    } catch {
      setError(t('error.network'));
    } finally {
      setSaving(false);
    }
  }

  return (
    <form
      noValidate
      onSubmit={(event) => void submit(event)}
      className="grid gap-2"
    >
      <FormField
        label={t('owners.newNote')}
        required
        error={error ?? undefined}
        hint={`${body.length.toLocaleString('en-US')} / ${NOTE_BODY_MAX_LENGTH.toLocaleString('en-US')}`}
      >
        {(field) => (
          <Textarea
            {...field}
            rows={3}
            value={body}
            maxLength={NOTE_BODY_MAX_LENGTH}
            disabled={saving}
            placeholder={t('owners.notePlaceholder')}
            onChange={(event) => setBody(event.target.value)}
          />
        )}
      </FormField>
      <Button
        type="submit"
        variant="soft"
        className="justify-self-end"
        disabled={saving}
      >
        {saving ? (
          <LoaderCircle aria-hidden className="animate-spin" />
        ) : (
          <StickyNote aria-hidden />
        )}
        {saving ? t('calling.saving') : t('owners.addNote')}
      </Button>
    </form>
  );
}

const TIMELINE_ICON: Record<OwnerTimelineItem['kind'], LucideIcon> = {
  CALL: PhoneCall,
  NOTE: StickyNote,
  REMINDER: BellPlus,
  ASSIGN: UsersRound,
};

function TimelineEntry({
  item,
  last,
}: {
  item: OwnerTimelineItem;
  last: boolean;
}) {
  const { t, locale } = useTranslation();
  const Icon = TIMELINE_ICON[item.kind];
  let title: string;
  let body: React.ReactNode = null;
  switch (item.kind) {
    case 'CALL':
      title = t('owners.timelineCall', { name: item.call.member.name });
      body = (
        <>
          <span
            className={cn(
              'font-semibold',
              !item.call.outcome && 'text-warning',
            )}
          >
            {item.call.outcome?.label ?? t('today.outcomeMissing')}
          </span>
          {item.call.note && (
            <span className="block whitespace-pre-line">{item.call.note}</span>
          )}
        </>
      );
      break;
    case 'NOTE':
      title = t('owners.timelineNote', { name: item.note.author.name });
      body = <span className="whitespace-pre-line">{item.note.body}</span>;
      break;
    case 'REMINDER':
      title = t('owners.timelineReminder', {
        date: formatDate(item.reminder.dueAt, locale, 'dateTime'),
      });
      body = item.reminder.note;
      break;
    case 'ASSIGN':
      title = item.to
        ? t('owners.timelineAssign', { to: item.to.name, by: item.by.name })
        : t('owners.timelineUnassign', { by: item.by.name });
      break;
  }
  return (
    <li className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-3">
      <div className="flex flex-col items-center">
        <span
          aria-hidden
          className="grid size-8 place-items-center rounded-pill bg-primary-soft text-primary-soft-foreground"
        >
          <Icon className="size-4" />
        </span>
        {!last && <span aria-hidden className="w-px flex-1 bg-border" />}
      </div>
      <div className={cn('grid min-w-0 gap-0.5 pt-1', !last && 'pb-4')}>
        <p className="text-sm font-semibold break-words">{title}</p>
        <DateText
          value={item.at}
          style="dateTime"
          className="text-xs text-muted-foreground"
        />
        {body && (
          <p dir="auto" className="text-sm break-words text-muted-foreground">
            {body}
          </p>
        )}
      </div>
    </li>
  );
}
