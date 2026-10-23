'use client';

import { useEffect, useId, useRef, useState } from 'react';
import { MapPin } from 'lucide-react';
import type { AreaOption } from '@prime-crm/shared';
import { LOOKUP_LISTING_AREAS } from '@/apis';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { useTranslation } from '@/i18n/i18n-provider';
import { callApi } from '@/lib/callApi';
import { cn } from '@/lib/utils';

const LOOKUP_DELAY_MS = 250;

/**
 * Free text with suggestions: typing looks up the areas already used on owners and listings
 * (`GET /lookups/areas`), and picking one also hands over its compounds. Anything typed is kept
 * as is — a new area is allowed. Suggestions open inline under the field, so they work inside a
 * scrolling sheet without being clipped.
 */
export function AreaCombobox({
  value,
  onChange,
  onPick,
  placeholder,
  className,
  ...field
}: {
  value: string;
  onChange: (value: string) => void;
  /** An existing area was chosen (with its compounds). */
  onPick?: (option: AreaOption) => void;
  placeholder: string;
  className?: string;
  id?: string;
  required?: boolean;
  'aria-invalid'?: true;
  'aria-describedby'?: string;
}) {
  const { t, locale } = useTranslation();
  const listId = useId();
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [options, setOptions] = useState<AreaOption[]>([]);
  const [active, setActive] = useState(-1);
  const request = useRef(0);

  useEffect(() => {
    if (!open) return;
    const ticket = ++request.current;
    const timer = setTimeout(() => {
      setLoading(true);
      void callApi(
        LOOKUP_LISTING_AREAS({ q: value.trim() || undefined, limit: 8 }),
        {
          showErrorToast: false,
        },
      )
        .then((res) => {
          if (ticket !== request.current) return;
          setOptions(res.success ? res.data : []);
          setActive(-1);
        })
        .catch(() => {
          if (ticket === request.current) setOptions([]);
        })
        .finally(() => {
          if (ticket === request.current) setLoading(false);
        });
    }, LOOKUP_DELAY_MS);
    return () => clearTimeout(timer);
  }, [open, value]);

  function pick(option: AreaOption) {
    onChange(option.area);
    onPick?.(option);
    setOpen(false);
  }

  return (
    <div className={cn('grid gap-1.5', className)}>
      <Input
        {...field}
        role="combobox"
        aria-expanded={open}
        aria-controls={listId}
        aria-autocomplete="list"
        autoComplete="off"
        placeholder={placeholder}
        value={value}
        onFocus={() => setOpen(true)}
        onBlur={() => setOpen(false)}
        onChange={(event) => {
          onChange(event.target.value);
          setOpen(true);
        }}
        onKeyDown={(event) => {
          if (!open) return;
          if (event.key === 'ArrowDown') {
            event.preventDefault();
            setActive((i) => Math.min(i + 1, options.length - 1));
          } else if (event.key === 'ArrowUp') {
            event.preventDefault();
            setActive((i) => Math.max(i - 1, 0));
          } else if (event.key === 'Enter' && active >= 0 && options[active]) {
            event.preventDefault();
            pick(options[active]);
          } else if (event.key === 'Escape') setOpen(false);
        }}
      />
      {open && (
        <div
          id={listId}
          role="listbox"
          aria-label={t('listings.lookup.suggestions')}
          aria-busy={loading || undefined}
          className="scrollbar-clean max-h-52 overflow-y-auto overscroll-contain rounded-md bg-popover p-1.5 shadow-raised"
        >
          {loading && options.length === 0 ? (
            <div
              className="grid gap-2 p-2"
              aria-label={t('listings.lookup.loading')}
            >
              <Skeleton className="h-4 w-2/3 rounded-pill" />
              <Skeleton className="h-4 w-1/2 rounded-pill" />
            </div>
          ) : options.length === 0 ? (
            <p className="px-3 py-2.5 text-sm text-muted-foreground">
              {t('listings.lookup.empty')}
            </p>
          ) : (
            options.map((option, index) => (
              <div
                key={option.area}
                role="option"
                aria-selected={index === active}
                // mousedown keeps the field focused so blur doesn't close the list first
                onMouseDown={(event) => {
                  event.preventDefault();
                  pick(option);
                }}
                className={cn(
                  'flex min-h-11 cursor-pointer items-center gap-2.5 rounded-sm px-3 text-sm',
                  index === active
                    ? 'bg-accent text-accent-foreground'
                    : 'hover:bg-accent',
                )}
              >
                <MapPin
                  aria-hidden
                  className="size-4 shrink-0 text-muted-foreground"
                />
                <span className="min-w-0 truncate font-semibold">
                  {option.area}
                </span>
                {option.compounds.length > 0 && (
                  <span className="min-w-0 truncate text-xs text-muted-foreground">
                    {option.compounds
                      .slice(0, 3)
                      .join(locale === 'ar' ? '، ' : ', ')}
                  </span>
                )}
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
}
