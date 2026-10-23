'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  ArrowDown,
  ArrowUp,
  Eye,
  EyeOff,
  ListChecks,
  LoaderCircle,
  PencilLine,
  Plus,
  Trash2,
} from 'lucide-react';
import type { CallOutcome } from '@prime-crm/shared';
import { DELETE_CALL_OUTCOME, UPDATE_CALL_OUTCOME } from '@/apis';
import { Panel, useAction } from '@/components/admin/admin-ui';
import { ConfirmDialog } from '@/components/confirm-dialog';
import { EmptyState } from '@/components/empty-state';
import { StatusChip } from '@/components/status-chip';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { useTranslation } from '@/i18n/i18n-provider';
import { callApi } from '@/lib/callApi';
import { cn } from '@/lib/utils';
import { OutcomeDialog } from './outcome-dialog';

/** The list after moving item `from` one step (`-1` up, `+1` down), or null at an edge. */
export function moved<T>(list: readonly T[], from: number, step: -1 | 1) {
  const to = from + step;
  if (to < 0 || to >= list.length) return null;
  const next = [...list];
  [next[from], next[to]] = [next[to] as T, next[from] as T];
  return next;
}

type Dialog =
  | { kind: 'none' }
  | { kind: 'edit'; outcome: CallOutcome | null }
  | { kind: 'delete'; outcome: CallOutcome }
  | { kind: 'inUse'; outcome: CallOutcome };

/**
 * Call outcomes: add, rename (EN/AR), set the status each one gives the owner, hide / show,
 * reorder, and delete the ones no call has used. Deleting one in use offers Hide instead.
 */
export function OutcomesManager({ outcomes }: { outcomes: CallOutcome[] }) {
  const { t, locale } = useTranslation();
  const router = useRouter();
  const [items, setItems] = useState(outcomes);
  const [dialog, setDialog] = useState<Dialog>({ kind: 'none' });
  const { run, pendingKey, pending } = useAction();

  // The server's list wins whenever it changes (after a refresh).
  const [source, setSource] = useState(outcomes);
  if (source !== outcomes) {
    setSource(outcomes);
    setItems(outcomes);
  }

  const label = (o: CallOutcome) => (locale === 'ar' ? o.labelAr : o.labelEn);
  const other = (o: CallOutcome) => (locale === 'ar' ? o.labelEn : o.labelAr);
  const close = () => setDialog({ kind: 'none' });

  async function setHidden(outcome: CallOutcome, hidden: boolean) {
    const res = await callApi(UPDATE_CALL_OUTCOME(outcome.id, { hidden }), {
      showSuccessToast: true,
      successMessage: hidden
        ? t('admin.settings.outcomeHidden')
        : t('admin.settings.outcomeShown'),
    });
    if (!res.success) return false;
    setItems((list) => list.map((o) => (o.id === res.data.id ? res.data : o)));
    router.refresh();
    return true;
  }

  /** Writes `order` = position for every outcome whose position changed. */
  async function move(index: number, step: -1 | 1) {
    const next = moved(items, index, step);
    if (!next) return;
    const previous = items;
    setItems(next);
    const changes = next
      .map((o, position) => ({ o, order: position + 1 }))
      .filter(({ o, order }) => o.order !== order);
    for (const { o, order } of changes) {
      const res = await callApi(UPDATE_CALL_OUTCOME(o.id, { order }));
      if (!res.success) {
        setItems(previous);
        router.refresh();
        return;
      }
    }
    setItems(next.map((o, position) => ({ ...o, order: position + 1 })));
    router.refresh();
  }

  return (
    <Panel
      title={t('admin.settings.outcomesTitle')}
      description={t('admin.settings.outcomesBody')}
      testId="outcomes-panel"
      actions={
        <Button
          variant="soft"
          disabled={pending}
          onClick={() => setDialog({ kind: 'edit', outcome: null })}
          data-testid="add-outcome"
        >
          <Plus aria-hidden />
          {t('admin.settings.addOutcome')}
        </Button>
      }
    >
      {items.length === 0 ? (
        <EmptyState
          icon={ListChecks}
          title={t('admin.settings.noOutcomesTitle')}
          body={t('admin.settings.noOutcomesBody')}
          className="shadow-none"
        />
      ) : (
        <ol className="grid gap-2" aria-busy={pending || undefined}>
          {items.map((outcome, index) => {
            const name = label(outcome);
            const busy = (action: string) =>
              pendingKey === `${action}-${outcome.id}`;
            return (
              <li
                key={outcome.id}
                data-testid="outcome-row"
                data-outcome={outcome.labelEn}
                className={cn(
                  'grid grid-cols-[auto_1fr] items-center gap-x-3 gap-y-2 rounded-md bg-secondary/60 p-2 ps-1.5 md:grid-cols-[auto_1fr_auto]',
                  outcome.hidden && 'bg-secondary/30',
                )}
              >
                <div className="row-span-2 flex flex-col md:row-span-1">
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    aria-label={t('admin.settings.moveUp', { name })}
                    disabled={pending || index === 0}
                    onClick={() =>
                      void run(`up-${outcome.id}`, () => move(index, -1))
                    }
                  >
                    {busy('up') ? (
                      <LoaderCircle aria-hidden className="animate-spin" />
                    ) : (
                      <ArrowUp aria-hidden />
                    )}
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    aria-label={t('admin.settings.moveDown', { name })}
                    disabled={pending || index === items.length - 1}
                    onClick={() =>
                      void run(`down-${outcome.id}`, () => move(index, 1))
                    }
                  >
                    {busy('down') ? (
                      <LoaderCircle aria-hidden className="animate-spin" />
                    ) : (
                      <ArrowDown aria-hidden />
                    )}
                  </Button>
                </div>
                <div className="grid min-w-0 gap-1.5">
                  <div className="grid min-w-0">
                    <span
                      className={cn(
                        'truncate font-bold',
                        outcome.hidden && 'text-muted-foreground',
                      )}
                    >
                      <bdi>{name}</bdi>
                    </span>
                    <span
                      lang={locale === 'ar' ? 'en' : 'ar'}
                      className="truncate text-xs text-muted-foreground"
                    >
                      <bdi>{other(outcome)}</bdi>
                    </span>
                  </div>
                  <div className="flex flex-wrap items-center gap-1.5">
                    <StatusChip kind="lead" status={outcome.setsStatus} />
                    {outcome.hidden && (
                      <Badge variant="outline" dot="none">
                        <EyeOff aria-hidden />
                        {t('admin.settings.hidden')}
                      </Badge>
                    )}
                    {outcome.inUse && (
                      <Badge variant="neutral" dot="none">
                        {t('admin.settings.inUse')}
                      </Badge>
                    )}
                  </div>
                </div>
                <div className="col-start-2 flex items-center gap-1 md:col-start-3">
                  <Button
                    variant="ghost"
                    size="sm"
                    disabled={pending}
                    aria-label={t('admin.settings.editOutcome', { name })}
                    onClick={() => setDialog({ kind: 'edit', outcome })}
                    data-testid="outcome-edit"
                  >
                    <PencilLine aria-hidden />
                    <span className="max-sm:sr-only">{t('admin.edit')}</span>
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    disabled={pending}
                    aria-label={
                      outcome.hidden
                        ? t('admin.settings.showOutcome', { name })
                        : t('admin.settings.hideOutcome', { name })
                    }
                    onClick={() =>
                      void run(`hide-${outcome.id}`, () =>
                        setHidden(outcome, !outcome.hidden),
                      )
                    }
                    data-testid="outcome-toggle-hidden"
                  >
                    {busy('hide') ? (
                      <LoaderCircle aria-hidden className="animate-spin" />
                    ) : outcome.hidden ? (
                      <Eye aria-hidden />
                    ) : (
                      <EyeOff aria-hidden />
                    )}
                    <span className="max-sm:sr-only">
                      {outcome.hidden
                        ? t('admin.settings.show')
                        : t('admin.settings.hide')}
                    </span>
                  </Button>
                  {!(outcome.inUse && outcome.hidden) && (
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      className="text-destructive hover:text-destructive"
                      disabled={pending}
                      aria-label={t('admin.settings.deleteOutcome', { name })}
                      onClick={() =>
                        setDialog({
                          kind: outcome.inUse ? 'inUse' : 'delete',
                          outcome,
                        })
                      }
                      data-testid="outcome-delete"
                    >
                      <Trash2 aria-hidden />
                    </Button>
                  )}
                </div>
              </li>
            );
          })}
        </ol>
      )}

      <OutcomeDialog
        outcome={dialog.kind === 'edit' ? dialog.outcome : null}
        open={dialog.kind === 'edit'}
        onOpenChange={(next) => !next && close()}
        onSaved={(saved) => {
          setItems((list) =>
            list.some((o) => o.id === saved.id)
              ? list.map((o) => (o.id === saved.id ? saved : o))
              : [...list, saved],
          );
          router.refresh();
        }}
      />
      {dialog.kind === 'delete' && (
        <ConfirmDialog
          open
          onOpenChange={(next) => !next && close()}
          title={t('admin.settings.deleteTitle', {
            name: label(dialog.outcome),
          })}
          description={t('admin.settings.deleteBody')}
          confirmLabel={t('action.delete')}
          destructive
          onConfirm={async () => {
            const outcome = dialog.outcome;
            const res = await callApi(DELETE_CALL_OUTCOME(outcome.id), {
              // In use (a call took it meanwhile): offer Hide instead of a toast.
              showErrorToast: false,
              showSuccessToast: true,
              successMessage: t('admin.settings.outcomeDeleted'),
            });
            if (res.success) {
              setItems((list) => list.filter((o) => o.id !== outcome.id));
              router.refresh();
              return;
            }
            if (!('error' in res) || res.error !== 'OUTCOME_IN_USE') {
              await callApi(Promise.resolve(res));
              return false;
            }
            setDialog({ kind: 'inUse', outcome: { ...outcome, inUse: true } });
            return false;
          }}
        />
      )}
      {dialog.kind === 'inUse' && (
        <ConfirmDialog
          open
          onOpenChange={(next) => !next && close()}
          title={t('admin.settings.inUseTitle', {
            name: label(dialog.outcome),
          })}
          description={t('admin.settings.inUseBody')}
          confirmLabel={t('admin.settings.hideInstead')}
          onConfirm={async () => {
            const ok = await setHidden(dialog.outcome, true);
            if (ok) close();
            return false;
          }}
        />
      )}
    </Panel>
  );
}
