'use client';

import { useEffect, useRef, useState } from 'react';
import { LoaderCircle, Search, X } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { useTranslation } from '@/i18n/i18n-provider';
import { cn } from '@/lib/utils';

/**
 * A search box that reports what was typed after a short pause (not on every key), shows that
 * the list is catching up, and clears with one tap.
 */
export function SearchField({
  label,
  placeholder,
  value,
  onSearch,
  pending = false,
  maxLength,
  delayMs = 350,
  className,
}: {
  label: string;
  placeholder: string;
  /** The search the list currently shows (from the URL). */
  value: string;
  onSearch: (value: string) => void;
  pending?: boolean;
  maxLength?: number;
  delayMs?: number;
  className?: string;
}) {
  const { t } = useTranslation();
  const [text, setText] = useState(value);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    [],
  );

  const schedule = (next: string, delay: number) => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => onSearch(next.trim()), delay);
  };

  return (
    <div className={cn('relative', className)}>
      <span
        aria-hidden
        className="pointer-events-none absolute inset-y-0 start-4 grid place-items-center text-muted-foreground"
      >
        {pending ? (
          <LoaderCircle className="size-4 animate-spin" />
        ) : (
          <Search className="size-4" />
        )}
      </span>
      <Input
        type="search"
        aria-label={label}
        placeholder={placeholder}
        value={text}
        maxLength={maxLength}
        enterKeyHint="search"
        className="ps-11 pe-12 [&::-webkit-search-cancel-button]:appearance-none"
        onChange={(event) => {
          setText(event.target.value);
          schedule(event.target.value, delayMs);
        }}
        onKeyDown={(event) => {
          if (event.key === 'Enter') schedule(text, 0);
        }}
      />
      {text && (
        <button
          type="button"
          aria-label={t('action.clearSearch')}
          onClick={() => {
            setText('');
            schedule('', 0);
          }}
          className="absolute inset-y-0 end-0 grid w-11 cursor-pointer place-items-center rounded-pill text-muted-foreground hover:text-foreground"
        >
          <X aria-hidden className="size-4" />
        </button>
      )}
    </div>
  );
}
