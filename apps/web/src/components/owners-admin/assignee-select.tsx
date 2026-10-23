'use client';

import { useCallback, useEffect, useState } from 'react';
import { UserRound } from 'lucide-react';
import type { UserSummary } from '@prime-crm/shared';
import { GET_ASSIGNEE_OPTIONS } from '@/apis';
import { FormField } from '@/components/form-field';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { useTranslation } from '@/i18n/i18n-provider';
import { isUnauthorized } from '@/lib/api-result';
import { callApi } from '@/lib/callApi';

/** `unassigned` in a picker value means "nobody"; anything else is a user id. */
export const UNASSIGNED = 'unassigned';

export type OptionsState =
  | { status: 'loading' }
  | { status: 'error' }
  | { status: 'ready'; options: UserSummary[] };

/** The active users work can go to (`GET /users/options`, active only), loaded when `enabled`. */
export function useAssigneeOptions(enabled: boolean) {
  const [state, setState] = useState<OptionsState>({ status: 'loading' });
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    if (!enabled) return;
    let live = true;
    void callApi(GET_ASSIGNEE_OPTIONS(), { showErrorToast: false }).then(
      (res) => {
        if (!live || isUnauthorized(res)) return;
        setState(
          res.success
            ? { status: 'ready', options: res.data }
            : { status: 'error' },
        );
      },
    );
    return () => {
      live = false;
    };
  }, [enabled, attempt]);

  const retry = useCallback(() => {
    setState({ status: 'loading' });
    setAttempt((n) => n + 1);
  }, []);

  return { state, retry };
}

/**
 * Who gets the work: "Nobody (unassigned)" (when `allowUnassigned`) plus every active user. While
 * the list loads the field is a skeleton of its size; with no active user it says so and where to
 * add one.
 */
export function AssigneeSelect({
  label,
  hint,
  required,
  value,
  onChange,
  state,
  onRetry,
  allowUnassigned = true,
  noneLabel,
  placeholder,
  disabled,
  error,
}: {
  label: string;
  hint?: string;
  required?: boolean;
  /** '' = nothing picked yet. */
  value: string;
  onChange: (value: string) => void;
  state: OptionsState;
  onRetry: () => void;
  allowUnassigned?: boolean;
  /** Label of the "nobody" choice. */
  noneLabel: string;
  placeholder: string;
  disabled?: boolean;
  error?: string;
}) {
  const { t } = useTranslation();
  const empty = state.status === 'ready' && state.options.length === 0;

  return (
    <div className="grid gap-3">
      <FormField label={label} hint={hint} required={required} error={error}>
        {(field) =>
          state.status === 'loading' ? (
            <Skeleton
              className="h-11 w-full rounded-sm"
              aria-label={t('list.loading')}
            />
          ) : (
            <Select
              value={value || undefined}
              onValueChange={onChange}
              disabled={disabled || state.status === 'error'}
            >
              <SelectTrigger
                id={field.id}
                aria-invalid={field['aria-invalid']}
                aria-describedby={field['aria-describedby']}
                aria-required={required || undefined}
                data-testid="assignee-select"
              >
                <SelectValue placeholder={placeholder} />
              </SelectTrigger>
              <SelectContent>
                {allowUnassigned && (
                  <SelectItem value={UNASSIGNED}>{noneLabel}</SelectItem>
                )}
                {state.status === 'ready' &&
                  state.options.map((user) => (
                    <SelectItem key={user.id} value={user.id}>
                      <bdi>{user.name}</bdi>
                    </SelectItem>
                  ))}
              </SelectContent>
            </Select>
          )
        }
      </FormField>
      {empty && (
        <div
          role="status"
          className="flex items-start gap-3 rounded-md bg-secondary p-3 text-sm"
        >
          <UserRound
            aria-hidden
            className="mt-0.5 size-4 shrink-0 text-muted-foreground"
          />
          <div className="grid gap-0.5">
            <p className="font-semibold">{t('ownersAdmin.noMembersTitle')}</p>
            <p className="text-muted-foreground">
              {t('ownersAdmin.noMembersBody')}
            </p>
          </div>
        </div>
      )}
      {state.status === 'error' && (
        <div
          role="alert"
          className="flex flex-wrap items-center justify-between gap-2 rounded-md bg-destructive-soft p-3 text-sm text-destructive"
        >
          <span>{t('ownersAdmin.membersFailed')}</span>
          <Button variant="secondary" size="sm" onClick={onRetry}>
            {t('action.retry')}
          </Button>
        </div>
      )}
    </div>
  );
}
