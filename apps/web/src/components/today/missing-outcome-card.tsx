'use client';

import { CircleAlert } from 'lucide-react';
import type { Call } from '@prime-crm/shared';
import { toSummary, useCallFlow } from '@/components/calling/call-flow';
import { Button } from '@/components/ui/button';
import { useTranslation } from '@/i18n/i18n-provider';
import { isolate } from '@/lib/bidi';
import { sameCairoDay } from '@/lib/cairo-time';
import { formatDate } from '@/lib/format';

/** A call left without an outcome: the amber card from the approved Today. Tap → outcome sheet. */
export function MissingOutcomeCard({ call, now }: { call: Call; now: Date }) {
  const { t, locale } = useTranslation();
  const { openOutcome } = useCallFlow();
  const started = new Date(call.startedAt);
  const body = sameCairoDay(started, now)
    ? t('today.missingBody', {
        name: isolate(call.owner.name),
        time: formatDate(started, locale, 'time'),
      })
    : t('today.missingBodyEarlier', {
        name: isolate(call.owner.name),
        date: formatDate(started, locale, 'dateTime'),
      });

  return (
    <div
      data-testid="missing-outcome"
      className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-3 gap-y-1 rounded-lg border border-urgency/35 bg-linear-135 from-urgency-soft to-card to-80% p-4 shadow-raised"
    >
      <span
        aria-hidden
        className="row-span-3 grid size-10 place-items-center rounded-[14px] bg-urgency text-urgency-foreground"
      >
        <CircleAlert className="size-5" />
      </span>
      <strong className="text-[15px] font-bold">
        {t('today.outcomeMissing')}
      </strong>
      <p className="text-[13px] break-words text-muted-foreground">{body}</p>
      <Button
        variant="inverse"
        size="sm"
        className="mt-2 h-11 justify-self-start"
        onClick={() => openOutcome(toSummary(call))}
      >
        {t('today.addOutcome')}
      </Button>
    </div>
  );
}
