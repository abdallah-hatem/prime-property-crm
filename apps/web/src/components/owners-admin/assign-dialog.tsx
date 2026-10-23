'use client';

import { useRef, useState } from 'react';
import { LoaderCircle } from 'lucide-react';
import { ASSIGN_OWNERS } from '@/apis';
import {
  AssigneeSelect,
  UNASSIGNED,
  useAssigneeOptions,
} from '@/components/owners-admin/assignee-select';
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
import { useTranslation } from '@/i18n/i18n-provider';
import { isUnauthorized } from '@/lib/api-result';
import { callApi } from '@/lib/callApi';
import { formatNumber } from '@/lib/format';
import { handleResponse } from '@/lib/handleResponse';

/**
 * Assign the selected owners to one active user, or to nobody. Says how many are moving and that
 * their open reminders and listings go with them; one request however often Assign is tapped;
 * the result is a toast with the count the API actually moved.
 */
export function AssignDialog({
  open,
  onOpenChange,
  ownerIds,
  onAssigned,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  ownerIds: readonly string[];
  onAssigned: (moved: number) => void;
}) {
  const { t } = useTranslation();
  const { state, retry } = useAssigneeOptions(open);
  const [value, setValue] = useState('');
  const [error, setError] = useState<string>();
  const [pending, setPending] = useState(false);
  const inFlight = useRef(false);
  const count = ownerIds.length;

  const close = (next: boolean) => {
    if (pending) return;
    if (!next) {
      setValue('');
      setError(undefined);
    }
    onOpenChange(next);
  };

  async function assign() {
    if (inFlight.current) return;
    if (!value) {
      setError(t('ownersAdmin.pickFirst'));
      return;
    }
    inFlight.current = true;
    setPending(true);
    const assigneeId = value === UNASSIGNED ? null : value;
    const name =
      state.status === 'ready'
        ? state.options.find((user) => user.id === value)?.name
        : undefined;
    try {
      const res = await callApi(
        ASSIGN_OWNERS({ ownerIds: [...ownerIds], assigneeId }),
      );
      if (isUnauthorized(res) || !res.success) return;
      const moved = formatNumber(res.data.moved);
      handleResponse(res, {
        showSuccessToast: true,
        successMessage:
          res.data.moved === 0
            ? t('ownersAdmin.doneNothing')
            : assigneeId === null
              ? t('ownersAdmin.doneUnassigned', { moved })
              : t('ownersAdmin.done', { moved, name: name ?? '' }),
      });
      setValue('');
      onAssigned(res.data.moved);
      onOpenChange(false);
    } finally {
      inFlight.current = false;
      setPending(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={close}>
      <DialogContent
        size="sm"
        variant="sheet"
        aria-busy={pending || undefined}
        data-testid="assign-dialog"
      >
        <DialogHeader>
          <DialogTitle>
            {t('ownersAdmin.assignTitle', { count: formatNumber(count) })}
          </DialogTitle>
          <DialogDescription>
            {t('ownersAdmin.assignSummary', { count: formatNumber(count) })}
          </DialogDescription>
        </DialogHeader>
        <DialogBody>
          <AssigneeSelect
            label={t('ownersAdmin.assignTo')}
            required
            value={value}
            onChange={(next) => {
              setValue(next);
              setError(undefined);
            }}
            state={state}
            onRetry={retry}
            noneLabel={t('ownersAdmin.nobody')}
            placeholder={t('ownersAdmin.assignPlaceholder')}
            disabled={pending}
            error={error}
          />
        </DialogBody>
        <DialogFooter>
          <Button
            variant="secondary"
            disabled={pending}
            onClick={() => close(false)}
          >
            {t('action.cancel')}
          </Button>
          <Button
            disabled={pending || state.status !== 'ready'}
            onClick={() => void assign()}
            data-testid="assign-confirm"
          >
            {pending && <LoaderCircle aria-hidden className="animate-spin" />}
            {pending
              ? t('dialog.working')
              : t('ownersAdmin.assignCount', { count: formatNumber(count) })}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
