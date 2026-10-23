'use client';

import { LoaderCircle, Phone } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useTranslation } from '@/i18n/i18n-provider';
import { cn } from '@/lib/utils';
import { useCallFlow, type CallTarget } from './call-flow';

/**
 * The gradient Call pill (one per row). Busy while its call is being created; every other Call
 * button waits too, so two taps on two rows can't start two calls.
 */
export function CallButton({
  target,
  phone,
  className,
  size = 'row',
}: {
  target: CallTarget;
  /** Call this number directly instead of asking which one. */
  phone?: string;
  className?: string;
  size?: 'row' | 'dock';
}) {
  const { t } = useTranslation();
  const { startCall, busyOwnerId } = useCallFlow();
  const busy = busyOwnerId === target.id;
  return (
    <Button
      type="button"
      data-testid="call-button"
      aria-label={t('calling.callName', { name: target.name })}
      aria-busy={busy || undefined}
      disabled={busyOwnerId !== null}
      onClick={() => startCall(target, phone)}
      className={cn(
        size === 'row' ? 'h-12 ps-4 pe-5' : 'h-13 flex-1 px-6 text-base',
        // Another row's call is starting: stay solid, just not pressable.
        busyOwnerId !== null && !busy && 'disabled:opacity-100',
        className,
      )}
    >
      {busy ? (
        <LoaderCircle aria-hidden className="animate-spin" />
      ) : (
        <Phone aria-hidden className="fill-current" />
      )}
      {busy ? t('calling.calling') : t('action.call')}
    </Button>
  );
}
