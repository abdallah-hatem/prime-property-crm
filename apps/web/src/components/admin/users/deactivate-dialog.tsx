'use client';

import { useEffect, useId, useState } from 'react';
import { useRouter } from 'next/navigation';
import { LoaderCircle } from 'lucide-react';
import type { User, UserDetail, UserSummary } from '@prime-crm/shared';
import { DEACTIVATE_USER, GET_USER, GET_USER_OPTIONS } from '@/apis';
import { FormAlert, Select } from '@/components/admin/admin-ui';
import { RadioCards } from '@/components/admin/radio-cards';
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
import {
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { useTranslation } from '@/i18n/i18n-provider';
import { isUnauthorized } from '@/lib/api-result';
import { callApi } from '@/lib/callApi';
import { errorMessage } from '@/lib/error-message';
import { formatNumber } from '@/lib/format';

type HandOver = 'member' | 'nobody';

/**
 * Deactivation needs a hand-over choice (business doc, flow 8): another active user or nobody.
 * Nothing is pre-selected; the dialog shows what will move before the admin confirms.
 */
export function DeactivateDialog({
  user,
  open,
  onOpenChange,
}: {
  user: User;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const { t } = useTranslation();
  const [locked, setLocked] = useState(false);
  return (
    <Dialog open={open} onOpenChange={(next) => !locked && onOpenChange(next)}>
      <DialogContent variant="sheet" size="md" closeLabel={t('dialog.close')}>
        {open && (
          <DeactivateForm
            key={user.id}
            user={user}
            onBusy={setLocked}
            onDone={() => onOpenChange(false)}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}

type Loaded =
  | { state: 'loading' }
  | { state: 'error'; message: string }
  | { state: 'ready'; detail: UserDetail; others: UserSummary[] };

function DeactivateForm({
  user,
  onBusy,
  onDone,
}: {
  user: User;
  onBusy: (busy: boolean) => void;
  onDone: () => void;
}) {
  const { t } = useTranslation();
  const router = useRouter();
  const formId = useId();
  const [loaded, setLoaded] = useState<Loaded>({ state: 'loading' });
  const [attempt, setAttempt] = useState(0);
  const [choice, setChoice] = useState<HandOver | null>(null);
  const [memberId, setMemberId] = useState('');
  const [error, setError] = useState<{ choice?: string; form?: string }>({});
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let live = true;
    void Promise.all([
      callApi(GET_USER(user.id), { showErrorToast: false }),
      callApi(GET_USER_OPTIONS(true), { showErrorToast: false }),
    ]).then(([detail, options]) => {
      if (!live) return;
      if (detail.success && options.success)
        return setLoaded({
          state: 'ready',
          detail: detail.data,
          others: options.data.filter((option) => option.id !== user.id),
        });
      const failed = !detail.success
        ? detail
        : !options.success
          ? options
          : null;
      if (failed && !isUnauthorized(failed))
        setLoaded({ state: 'error', message: errorMessage(t, failed) });
    });
    return () => {
      live = false;
    };
  }, [user.id, attempt, t]);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (saving || loaded.state !== 'ready') return;
    if (!choice) return setError({ choice: t('admin.users.chooseHandOver') });
    if (choice === 'member' && !memberId)
      return setError({ choice: t('admin.users.chooseMember') });
    setSaving(true);
    onBusy(true);
    try {
      const res = await callApi(
        DEACTIVATE_USER(user.id, {
          handOverTo: choice === 'member' ? memberId : null,
        }),
        {
          showErrorToast: false,
          showSuccessToast: true,
          successMessage: t('admin.users.deactivated', { name: user.name }),
        },
      );
      if (res.success) {
        router.refresh();
        return onDone();
      }
      if (!isUnauthorized(res)) setError({ form: errorMessage(t, res) });
    } finally {
      setSaving(false);
      onBusy(false);
    }
  }

  const choiceError = `${formId}-choice-error`;
  const counts = loaded.state === 'ready' ? loaded.detail.counts : null;
  const others = loaded.state === 'ready' ? loaded.others : [];
  const nothing =
    counts !== null &&
    counts.owners + counts.listings + counts.openReminders === 0;

  return (
    <form
      noValidate
      onSubmit={(event) => void submit(event)}
      className="flex min-h-0 flex-1 flex-col"
      data-testid="deactivate-form"
    >
      <DialogHeader>
        <DialogTitle>
          {t('admin.users.deactivateTitle', { name: user.name })}
        </DialogTitle>
        <DialogDescription>{t('admin.users.deactivateBody')}</DialogDescription>
      </DialogHeader>
      <DialogBody className="grid content-start gap-5 pb-4">
        <section className="grid gap-2" aria-busy={loaded.state === 'loading'}>
          <h3 className="type-label">{t('admin.users.whatMoves')}</h3>
          {loaded.state === 'loading' ? (
            <div className="grid grid-cols-3 gap-2">
              {[0, 1, 2].map((i) => (
                <Skeleton key={i} className="h-17 rounded-md" />
              ))}
            </div>
          ) : loaded.state === 'error' ? (
            <div className="grid justify-items-start gap-2">
              <FormAlert message={loaded.message} />
              <Button
                type="button"
                variant="secondary"
                size="sm"
                onClick={() => {
                  setLoaded({ state: 'loading' });
                  setAttempt((n) => n + 1);
                }}
              >
                {t('action.retry')}
              </Button>
            </div>
          ) : nothing ? (
            <p className="text-sm text-muted-foreground">
              {t('admin.users.nothingToMove')}
            </p>
          ) : (
            <dl
              className="grid grid-cols-3 gap-2"
              data-testid="handover-counts"
            >
              {(
                [
                  ['owners', counts?.owners],
                  ['listings', counts?.listings],
                  ['reminders', counts?.openReminders],
                ] as const
              ).map(([key, value]) => (
                <div
                  key={key}
                  className="grid gap-0.5 rounded-md bg-secondary px-3 py-2.5"
                >
                  <dd className="font-numeric text-xl font-extrabold tabular-nums">
                    {formatNumber(value ?? 0)}
                  </dd>
                  <dt className="text-xs font-semibold text-muted-foreground">
                    {t(`admin.users.${key}`)}
                  </dt>
                </div>
              ))}
            </dl>
          )}
        </section>

        <div className="grid gap-2">
          <span id={`${formId}-label`} className="type-label">
            {t('admin.users.handOverLabel')}
            <span aria-hidden="true" className="ms-0.5 text-destructive">
              *
            </span>
          </span>
          <RadioCards<HandOver>
            label={t('admin.users.handOverLabel')}
            value={choice}
            disabled={saving || loaded.state !== 'ready'}
            invalid={!!error.choice}
            describedBy={error.choice ? choiceError : undefined}
            onChange={(next) => {
              setChoice(next);
              setError({});
            }}
            options={[
              {
                value: 'member',
                label: t('admin.users.toMember'),
                hint: t('admin.users.toMemberHint'),
                children:
                  others.length === 0 ? (
                    <p className="text-sm text-muted-foreground">
                      {t('admin.users.noMembers')}
                    </p>
                  ) : (
                    <Select
                      value={memberId || undefined}
                      disabled={saving}
                      onValueChange={(next) => {
                        setMemberId(next);
                        setError({});
                      }}
                    >
                      <SelectTrigger
                        aria-label={t('admin.users.memberPlaceholder')}
                        data-testid="handover-member"
                      >
                        <SelectValue
                          placeholder={t('admin.users.memberPlaceholder')}
                        />
                      </SelectTrigger>
                      <SelectContent>
                        {others.map((option) => (
                          <SelectItem key={option.id} value={option.id}>
                            {option.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  ),
              },
              {
                value: 'nobody',
                label: t('admin.users.toNobody'),
                hint: t('admin.users.toNobodyHint'),
              },
            ]}
          />
          {error.choice && (
            <p
              id={choiceError}
              role="alert"
              className="text-xs font-semibold text-destructive"
            >
              {error.choice}
            </p>
          )}
        </div>
        <FormAlert message={error.form} />
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
        <Button
          type="submit"
          variant="destructive"
          disabled={saving || loaded.state !== 'ready'}
          data-testid="deactivate-submit"
        >
          {saving && <LoaderCircle aria-hidden className="animate-spin" />}
          {saving ? t('dialog.working') : t('admin.users.deactivateConfirm')}
        </Button>
      </DialogFooter>
    </form>
  );
}
