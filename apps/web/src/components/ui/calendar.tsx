'use client';

import * as React from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { DayPicker } from 'react-day-picker';
import { arEG, enGB } from 'react-day-picker/locale';
import { cn } from '@/lib/utils';

/**
 * shadcn Calendar on react-day-picker: pill days, Latin numerals in both languages, the week
 * mirrored under Arabic (`dir`), and chevrons that point the reading way.
 */
function Calendar({
  className,
  classNames,
  lang = 'en',
  ...props
}: React.ComponentProps<typeof DayPicker> & { lang?: 'en' | 'ar' }) {
  return (
    <DayPicker
      locale={lang === 'ar' ? arEG : enGB}
      dir={lang === 'ar' ? 'rtl' : 'ltr'}
      numerals="latn"
      showOutsideDays
      className={cn('w-fit', className)}
      classNames={{
        months: 'relative flex flex-col gap-4',
        month: 'grid gap-3',
        month_caption: 'flex h-11 items-center justify-center',
        caption_label: 'type-label',
        nav: 'absolute inset-x-0 top-0 flex items-center justify-between',
        button_previous:
          'grid size-11 cursor-pointer place-items-center rounded-pill text-muted-foreground hover:bg-accent hover:text-accent-foreground disabled:cursor-not-allowed disabled:opacity-40',
        button_next:
          'grid size-11 cursor-pointer place-items-center rounded-pill text-muted-foreground hover:bg-accent hover:text-accent-foreground disabled:cursor-not-allowed disabled:opacity-40',
        month_grid: 'border-collapse',
        weekdays: 'flex',
        weekday: 'w-10 text-center text-xs font-semibold text-muted-foreground',
        week: 'mt-1 flex',
        day: 'size-10 p-0 text-center',
        day_button: cn(
          'grid size-10 cursor-pointer place-items-center rounded-pill font-numeric text-sm tabular-nums',
          'transition-colors duration-150 hover:bg-accent hover:text-accent-foreground',
          'focus-visible:outline-3 focus-visible:outline-offset-1 focus-visible:outline-ring',
          'disabled:cursor-not-allowed',
        ),
        selected:
          '[&>button]:bg-primary [&>button]:font-bold [&>button]:text-primary-foreground [&>button]:hover:bg-primary [&>button]:hover:text-primary-foreground',
        today: '[&>button]:font-bold [&>button]:text-primary',
        outside: 'opacity-40',
        disabled: 'opacity-35',
        hidden: 'invisible',
        ...classNames,
      }}
      components={{
        Chevron: ({ orientation, className: chevronClass }) =>
          orientation === 'left' ? (
            <ChevronLeft aria-hidden className={cn('size-5', chevronClass)} />
          ) : (
            <ChevronRight aria-hidden className={cn('size-5', chevronClass)} />
          ),
      }}
      {...props}
    />
  );
}

export { Calendar };
