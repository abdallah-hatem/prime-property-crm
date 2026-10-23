'use client';

import { useMemo, useState } from 'react';
import { CalendarDays } from 'lucide-react';
import { Calendar } from '@/components/ui/calendar';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useTranslation } from '@/i18n/i18n-provider';
import {
  addDays,
  fromCairo,
  toCairo,
  type CairoDay,
  type CairoTime,
} from '@/lib/cairo-time';
import { formatDate } from '@/lib/format';
import { cn } from '@/lib/utils';

export interface DateTimeValue {
  day: CairoDay | null;
  time: CairoTime | null;
}

export const EMPTY_DATE_TIME: DateTimeValue = { day: null, time: null };

const pad = (n: number) => String(n).padStart(2, '0');
/** Every quarter hour of the day. */
const SLOTS: CairoTime[] = Array.from(
  { length: 96 },
  (_, i) => `${pad(Math.floor(i / 4))}:${pad((i % 4) * 15)}`,
);
const MORNING: CairoTime = '10:00';

/** The day picker works in the browser's zone; a Cairo day maps to that local calendar day. */
const dayToLocalDate = (day: CairoDay): Date => {
  const [y, m, d] = day.split('-').map(Number) as [number, number, number];
  return new Date(y, m - 1, d);
};
const localDateToDay = (date: Date): CairoDay =>
  `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;

/** The next quarter hour at least `minutes` from now, in Cairo. */
function roundedFromNow(now: Date, minutes: number): DateTimeValue {
  const later = new Date(now.getTime() + minutes * 60000);
  later.setUTCMinutes(Math.ceil(later.getUTCMinutes() / 15) * 15, 0, 0);
  const { day, time } = toCairo(later);
  return { day, time };
}

/** The instant of a complete value, or null. */
export function dateTimeInstant(value: DateTimeValue): Date | null {
  return value.day && value.time ? fromCairo(value.day, value.time) : null;
}

/**
 * A Cairo date and time for a reminder: quick picks for the usual answers ("tomorrow morning"),
 * a calendar that can't go back before today, and a quarter-hour time list whose past slots are
 * disabled for today. The caller still checks the result is in the future on submit, since the
 * clock keeps running while the sheet is open.
 */
export function DateTimePicker({
  value,
  onChange,
  invalid,
  describedBy,
  idPrefix,
  now: nowProp,
}: {
  value: DateTimeValue;
  onChange: (value: DateTimeValue) => void;
  invalid?: boolean;
  describedBy?: string;
  idPrefix: string;
  /** For tests. */
  now?: Date;
}) {
  const { t, locale } = useTranslation();
  const [open, setOpen] = useState(false);
  // The picker's idea of "now" is fixed when it opens; past slots are re-checked on submit.
  const [now] = useState(() => nowProp ?? new Date());
  const today = toCairo(now).day;

  const presets = useMemo(
    () => [
      { label: t('picker.inTwoHours'), value: roundedFromNow(now, 120) },
      {
        label: t('picker.tomorrow'),
        value: { day: addDays(today, 1), time: MORNING },
      },
      {
        label: t('picker.inThreeDays'),
        value: { day: addDays(today, 3), time: MORNING },
      },
      {
        label: t('picker.nextWeek'),
        value: { day: addDays(today, 7), time: MORNING },
      },
    ],
    [now, today, t],
  );

  const slotTaken = (slot: CairoTime) =>
    value.day === today && fromCairo(today, slot).getTime() <= now.getTime();

  return (
    <div className="grid gap-3">
      <div
        role="group"
        aria-label={t('picker.quickPicks')}
        className="flex flex-wrap gap-2"
      >
        {presets.map((preset) => {
          const selected =
            preset.value.day === value.day && preset.value.time === value.time;
          return (
            <button
              key={preset.label}
              type="button"
              aria-pressed={selected}
              onClick={() => onChange(preset.value)}
              className={cn(
                'h-9 cursor-pointer rounded-pill px-3.5 text-[13px] font-semibold transition-colors duration-150',
                'focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-ring',
                selected
                  ? 'bg-primary text-primary-foreground'
                  : 'bg-secondary text-secondary-foreground hover:bg-accent hover:text-accent-foreground',
              )}
            >
              {preset.label}
            </button>
          );
        })}
      </div>
      <div className="grid grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)] gap-2">
        <Popover open={open} onOpenChange={setOpen}>
          <PopoverTrigger
            id={`${idPrefix}-date`}
            aria-label={t('picker.date')}
            aria-invalid={invalid || undefined}
            aria-describedby={describedBy}
            className={cn(
              'flex h-11 w-full min-w-0 cursor-pointer items-center gap-2 rounded-sm border border-input bg-card px-4 text-start text-base shadow-soft md:text-sm',
              'outline-none focus-visible:border-ring focus-visible:ring-4 focus-visible:ring-ring/20',
              'aria-invalid:border-destructive',
              !value.day && 'text-muted-foreground',
            )}
          >
            <CalendarDays
              aria-hidden
              className="size-4 shrink-0 text-muted-foreground"
            />
            <span className="truncate">
              {value.day
                ? formatDate(fromCairo(value.day, '12:00'), locale, 'date')
                : t('picker.datePlaceholder')}
            </span>
          </PopoverTrigger>
          <PopoverContent align="start" className="w-auto p-3">
            <Calendar
              lang={locale}
              mode="single"
              selected={value.day ? dayToLocalDate(value.day) : undefined}
              defaultMonth={dayToLocalDate(value.day ?? today)}
              disabled={{ before: dayToLocalDate(today) }}
              labels={{
                labelPrevious: () => t('picker.previousMonth'),
                labelNext: () => t('picker.nextMonth'),
              }}
              onSelect={(date) => {
                if (!date) return;
                const day = localDateToDay(date);
                const time =
                  value.time &&
                  !(day === today && fromCairo(day, value.time) <= now)
                    ? value.time
                    : day === today
                      ? roundedFromNow(now, 60).time
                      : MORNING;
                onChange({ day, time });
                setOpen(false);
              }}
            />
          </PopoverContent>
        </Popover>
        <Select
          value={value.time ?? undefined}
          onValueChange={(time) => onChange({ day: value.day ?? today, time })}
        >
          <SelectTrigger
            id={`${idPrefix}-time`}
            aria-label={t('picker.time')}
            aria-invalid={invalid || undefined}
            aria-describedby={describedBy}
          >
            <SelectValue placeholder={t('picker.timePlaceholder')} />
          </SelectTrigger>
          <SelectContent>
            {SLOTS.map((slot) => (
              <SelectItem key={slot} value={slot} disabled={slotTaken(slot)}>
                <bdi className="font-numeric tabular-nums">
                  {formatDate(
                    fromCairo(value.day ?? today, slot),
                    locale,
                    'time',
                  )}
                </bdi>
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
    </div>
  );
}
