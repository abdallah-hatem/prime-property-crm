'use client';

import { useState } from 'react';
import { CalendarDays } from 'lucide-react';
import type { DateRange } from 'react-day-picker';
import { ANALYTICS_MAX_DAYS } from '@prime-crm/shared';
import { FilterChips } from '@/components/filter-chips';
import { Calendar } from '@/components/ui/calendar';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { useTranslation } from '@/i18n/i18n-provider';
import type { CairoDay } from '@/lib/cairo-time';
import { cn } from '@/lib/utils';
import { shortDay } from './format-day';
import {
  RANGE_PRESETS,
  type DayRange,
  type RangePreset,
  type ResolvedRange,
} from './range';

const pad = (n: number) => String(n).padStart(2, '0');
/** The calendar works in local dates; a Cairo day maps to the same calendar date. */
const dayToDate = (day: CairoDay): Date => {
  const [y, m, d] = day.split('-').map(Number) as [number, number, number];
  return new Date(y, m - 1, d);
};
const dateToDay = (date: Date): CairoDay =>
  `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;

/**
 * The analytics range: preset pills (today, yesterday, this week, last 7 days, this month, last
 * 30 days) and a Custom pill that opens the calendar (two taps: first day, last day; at most
 * ANALYTICS_MAX_DAYS; nothing after today).
 */
export function RangeFilter({
  range,
  today,
  onPreset,
  onCustom,
  disabled,
}: {
  range: ResolvedRange;
  today: CairoDay;
  onPreset: (preset: RangePreset) => void;
  onCustom: (range: DayRange) => void;
  disabled?: boolean;
}) {
  const { t, locale } = useTranslation();
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<DateRange | undefined>(undefined);
  const custom = range.preset === 'custom';

  const options = RANGE_PRESETS.map((preset) => ({
    value: preset,
    label: t(`analytics.range.${preset}`),
  }));

  const commit = (picked: DateRange | undefined) => {
    if (!picked?.from) return;
    const from = dateToDay(picked.from);
    onCustom({ from, to: picked.to ? dateToDay(picked.to) : from });
  };

  return (
    <div
      role="group"
      aria-label={t('analytics.range.label')}
      className="-mx-4 flex scrollbar-clean items-center gap-2 overflow-x-auto px-4 pb-1 md:mx-0 md:items-start md:overflow-visible md:px-0"
    >
      <FilterChips
        label={t('analytics.range.label')}
        options={options}
        // A custom range presses no preset pill.
        value={(custom ? '' : range.preset) as RangePreset}
        onChange={onPreset}
        disabled={disabled}
        className="mx-0 shrink-0 overflow-visible px-0 pb-0 md:min-w-0 md:flex-1 md:flex-wrap"
      />
      <Popover
        open={open}
        onOpenChange={(next) => {
          if (next)
            setDraft(
              custom
                ? { from: dayToDate(range.from), to: dayToDate(range.to) }
                : undefined,
            );
          else if (draft?.from && !draft.to) commit(draft);
          setOpen(next);
        }}
      >
        <PopoverTrigger
          disabled={disabled}
          aria-pressed={custom}
          data-testid="range-custom"
          className={cn(
            'inline-flex h-11 shrink-0 cursor-pointer items-center gap-2 rounded-pill px-4 type-label whitespace-nowrap',
            'transition-[background-color,color,box-shadow] duration-200 ease-snappy',
            'focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-ring',
            'disabled:cursor-not-allowed',
            custom
              ? 'bg-primary text-primary-foreground shadow-glow'
              : 'bg-card text-muted-foreground shadow-soft hover:text-foreground',
          )}
        >
          <CalendarDays aria-hidden className="size-4" />
          {custom ? (
            <bdi className="font-numeric">
              {range.from === range.to
                ? shortDay(range.from, locale)
                : `${shortDay(range.from, locale)} – ${shortDay(range.to, locale)}`}
            </bdi>
          ) : (
            t('analytics.range.custom')
          )}
        </PopoverTrigger>
        <PopoverContent
          align="start"
          className="w-auto p-3"
          collisionPadding={16}
          data-testid="range-calendar"
        >
          <p className="px-1 pb-1 type-label">
            {t('analytics.range.customTitle')}
          </p>
          <p className="max-w-72 px-1 text-xs text-muted-foreground">
            {t('analytics.range.customHint', { max: ANALYTICS_MAX_DAYS })}
          </p>
          <Calendar
            lang={locale}
            mode="range"
            min={1}
            max={ANALYTICS_MAX_DAYS - 1}
            selected={draft}
            defaultMonth={dayToDate(custom ? range.from : today)}
            disabled={{ after: dayToDate(today) }}
            labels={{
              labelPrevious: () => t('analytics.range.previousMonth'),
              labelNext: () => t('analytics.range.nextMonth'),
            }}
            onSelect={(picked) => {
              setDraft(picked);
              if (picked?.from && picked.to) {
                commit(picked);
                setOpen(false);
              }
            }}
          />
        </PopoverContent>
      </Popover>
    </div>
  );
}
