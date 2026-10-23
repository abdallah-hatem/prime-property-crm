'use client';

import { useState } from 'react';
import { CalendarDays, X } from 'lucide-react';
import type { DateRange } from 'react-day-picker';
import { Calendar } from '@/components/ui/calendar';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { useTranslation } from '@/i18n/i18n-provider';
import { fromCairo, type CairoDay } from '@/lib/cairo-time';
import { formatDate } from '@/lib/format';
import { cn } from '@/lib/utils';

const pad = (n: number) => String(n).padStart(2, '0');
const dayToLocalDate = (day: CairoDay): Date => {
  const [y, m, d] = day.split('-').map(Number) as [number, number, number];
  return new Date(y, m - 1, d);
};
const localDateToDay = (date: Date): CairoDay =>
  `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;

/**
 * A from–to range of Cairo days in a popover calendar. A first tap picks the start, a second the
 * end; the range is applied once both are picked (or the popover closes with only a start).
 */
export function DateRangeFilter({
  from,
  to,
  today,
  onChange,
  disabled,
}: {
  from: CairoDay | null;
  to: CairoDay | null;
  today: CairoDay;
  onChange: (range: { from: CairoDay | null; to: CairoDay | null }) => void;
  disabled?: boolean;
}) {
  const { t, locale } = useTranslation();
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<DateRange | undefined>(undefined);

  const show = (day: CairoDay) =>
    formatDate(fromCairo(day, '12:00'), locale, 'date');
  const label =
    from && to
      ? from === to
        ? show(from)
        : `${show(from)} – ${show(to)}`
      : from
        ? `${show(from)} –`
        : t('admin.activity.anyDate');

  const commit = (range: DateRange | undefined) => {
    const start = range?.from ? localDateToDay(range.from) : null;
    const end = range?.to ? localDateToDay(range.to) : start;
    onChange({ from: start, to: end });
  };

  return (
    <div className="flex min-w-0 items-center gap-1">
      <Popover
        open={open}
        onOpenChange={(next) => {
          if (next)
            setDraft(
              from
                ? {
                    from: dayToLocalDate(from),
                    to: to ? dayToLocalDate(to) : undefined,
                  }
                : undefined,
            );
          else if (draft?.from && !draft.to) commit(draft);
          setOpen(next);
        }}
      >
        <PopoverTrigger
          aria-label={t('admin.activity.dates')}
          disabled={disabled}
          data-testid="activity-dates"
          className={cn(
            'flex h-11 w-full min-w-0 cursor-pointer items-center gap-2 rounded-sm border border-input bg-card px-4 text-start text-base shadow-soft md:text-sm',
            'outline-none focus-visible:border-ring focus-visible:ring-4 focus-visible:ring-ring/20',
            'disabled:cursor-not-allowed disabled:opacity-50',
            !from && 'text-muted-foreground',
          )}
        >
          <CalendarDays
            aria-hidden
            className="size-4 shrink-0 text-muted-foreground"
          />
          <bdi className="truncate font-numeric">{label}</bdi>
        </PopoverTrigger>
        <PopoverContent align="start" className="w-auto p-3">
          <Calendar
            lang={locale}
            mode="range"
            min={1}
            selected={draft}
            defaultMonth={dayToLocalDate(from ?? today)}
            disabled={{ after: dayToLocalDate(today) }}
            labels={{
              labelPrevious: () => t('picker.previousMonth'),
              labelNext: () => t('picker.nextMonth'),
            }}
            onSelect={(range) => {
              setDraft(range);
              if (range?.from && range.to) {
                commit(range);
                setOpen(false);
              }
            }}
          />
        </PopoverContent>
      </Popover>
      {from && (
        <button
          type="button"
          aria-label={t('admin.activity.clearDates')}
          disabled={disabled}
          onClick={() => onChange({ from: null, to: null })}
          className="grid size-11 shrink-0 cursor-pointer place-items-center rounded-pill text-muted-foreground hover:bg-accent hover:text-foreground disabled:cursor-not-allowed"
        >
          <X aria-hidden className="size-4" />
        </button>
      )}
    </div>
  );
}
