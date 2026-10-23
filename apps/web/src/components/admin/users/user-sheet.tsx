'use client';

import { useEffect, useId, useState } from 'react';
import { KeyRound, PencilLine, UserRoundCheck, UserRoundX } from 'lucide-react';
import type { User, UserDetail } from '@prime-crm/shared';
import { GET_USER } from '@/apis';
import { DisabledReason } from '@/components/admin/admin-ui';
import { UserAvatar } from '@/components/shell/user-avatar';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Skeleton } from '@/components/ui/skeleton';
import { useTranslation } from '@/i18n/i18n-provider';
import { UserText } from '@/components/user-text';
import { callApi } from '@/lib/callApi';
import { formatDate, formatNumber, formatPhone } from '@/lib/format';
import { cn } from '@/lib/utils';

export type UserAction = 'edit' | 'reset' | 'deactivate' | 'reactivate';

/** Status chip for a user: active (success) or deactivated (neutral). */
export function UserStatusChip({ active }: { active: boolean }) {
  const { t } = useTranslation();
  return (
    <Badge variant={active ? 'success' : 'neutral'}>
      {active ? t('admin.active') : t('admin.inactive')}
    </Badge>
  );
}

/**
 * One user and what can be done to them. Deactivate is disabled — with the reason next to it —
 * for the last active admin and for yourself.
 */
export function UserSheet({
  user,
  isSelf,
  lastAdmin,
  open,
  onOpenChange,
  onAction,
}: {
  user: User;
  isSelf: boolean;
  lastAdmin: boolean;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onAction: (action: UserAction) => void;
}) {
  const { t, locale } = useTranslation();
  const reasonId = useId();
  const [loaded, setLoaded] = useState<UserDetail | null>(null);
  // Counts of another user (the sheet was reused) are never shown.
  const detail = loaded?.id === user.id ? loaded : null;

  useEffect(() => {
    if (!open || !user.active) return;
    let live = true;
    void callApi(GET_USER(user.id), { showErrorToast: false }).then((res) => {
      if (live && res.success) setLoaded(res.data);
    });
    return () => {
      live = false;
    };
  }, [open, user.id, user.active]);

  const blocked = lastAdmin
    ? t('admin.users.lastAdminReason', { name: user.name })
    : isSelf
      ? t('admin.users.selfReason')
      : null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        variant="sheet"
        size="md"
        closeLabel={t('dialog.close')}
        data-testid="user-sheet"
      >
        <DialogHeader className="grid-cols-[auto_1fr] items-center gap-x-4">
          <UserAvatar
            name={user.name}
            className={cn(
              'row-span-2 size-14 text-base',
              !user.active && 'opacity-60',
            )}
          />
          <DialogTitle className="truncate">
            <UserText>{user.name}</UserText>
          </DialogTitle>
          <DialogDescription className="truncate" dir="ltr">
            <UserText>{user.email}</UserText>
          </DialogDescription>
        </DialogHeader>
        <DialogBody className="grid content-start gap-5 pb-6">
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="primary" dot="none">
              {user.role.name}
            </Badge>
            <UserStatusChip active={user.active} />
            {isSelf && (
              <Badge variant="outline" dot="none">
                {t('admin.you')}
              </Badge>
            )}
          </div>
          <dl className="grid grid-cols-2 gap-x-4 gap-y-3 text-sm">
            <div className="grid gap-0.5">
              <dt className="text-xs font-semibold text-muted-foreground">
                {t('admin.users.phone')}
              </dt>
              <dd>
                {user.phone ? (
                  <bdi dir="ltr" className="font-numeric tabular-nums">
                    {formatPhone(user.phone)}
                  </bdi>
                ) : (
                  <span className="text-muted-foreground">
                    {t('admin.users.noPhone')}
                  </span>
                )}
              </dd>
            </div>
            <div className="grid gap-0.5">
              <dt className="text-xs font-semibold text-muted-foreground">
                {t('admin.users.language')}
              </dt>
              <dd>
                {user.language === 'ar'
                  ? t('admin.users.languageAr')
                  : t('admin.users.languageEn')}
              </dd>
            </div>
            <div className="col-span-2 text-xs text-muted-foreground">
              {t('admin.users.added', {
                date: formatDate(user.createdAt, locale),
              })}
            </div>
          </dl>

          {user.active && (
            <section className="grid gap-2" aria-busy={!detail || undefined}>
              <h3 className="type-label">{t('admin.users.holds')}</h3>
              <div className="grid grid-cols-3 gap-2">
                {(['owners', 'listings', 'reminders'] as const).map((key) => (
                  <div
                    key={key}
                    className="grid gap-0.5 rounded-md bg-secondary px-3 py-2.5"
                  >
                    {detail ? (
                      <span className="font-numeric text-xl font-extrabold tabular-nums">
                        {formatNumber(
                          key === 'reminders'
                            ? detail.counts.openReminders
                            : detail.counts[key],
                        )}
                      </span>
                    ) : (
                      <Skeleton className="my-1 h-5 w-8 rounded-pill" />
                    )}
                    <span className="text-xs font-semibold text-muted-foreground">
                      {t(`admin.users.${key}`)}
                    </span>
                  </div>
                ))}
              </div>
            </section>
          )}

          <div className="grid gap-2 sm:grid-cols-2">
            <Button
              variant="soft"
              onClick={() => onAction('edit')}
              data-testid="user-action-edit"
            >
              <PencilLine aria-hidden />
              {t('admin.users.editDetails')}
            </Button>
            <Button
              variant="secondary"
              onClick={() => onAction('reset')}
              data-testid="user-action-reset"
            >
              <KeyRound aria-hidden />
              {t('admin.users.resetPassword')}
            </Button>
          </div>
          {user.active ? (
            <div className="grid gap-2">
              <Button
                variant="destructive-outline"
                disabled={!!blocked}
                aria-describedby={blocked ? reasonId : undefined}
                onClick={() => onAction('deactivate')}
                data-testid="user-action-deactivate"
              >
                <UserRoundX aria-hidden />
                {t('admin.users.deactivate')}
              </Button>
              {blocked && (
                <DisabledReason id={reasonId}>{blocked}</DisabledReason>
              )}
            </div>
          ) : (
            <Button
              variant="outline"
              onClick={() => onAction('reactivate')}
              data-testid="user-action-reactivate"
            >
              <UserRoundCheck aria-hidden />
              {t('admin.users.reactivate')}
            </Button>
          )}
        </DialogBody>
      </DialogContent>
    </Dialog>
  );
}
