'use client';

import { useState } from 'react';
import { House } from 'lucide-react';
import { useTranslation } from '@/i18n/i18n-provider';
import { cn } from '@/lib/utils';

/**
 * A listing photo, or — with no photo or a broken link — a soft placeholder: the primary wash
 * with a house mark, so a card never shows a grey box or a broken image icon.
 */
export function ListingCover({
  url,
  alt,
  className,
  iconClassName,
  showLabel = false,
  eager = false,
}: {
  url: string | null;
  alt: string;
  className?: string;
  iconClassName?: string;
  /** Say "No photos yet" under the mark (detail page). */
  showLabel?: boolean;
  eager?: boolean;
}) {
  const { t } = useTranslation();
  const [broken, setBroken] = useState(false);

  if (!url || broken)
    return (
      <div
        role="img"
        aria-label={t('listings.noPhoto')}
        className={cn(
          'grid place-items-center bg-linear-to-br from-primary-soft via-accent to-secondary text-primary-soft-foreground',
          className,
        )}
      >
        <span className="grid justify-items-center gap-2">
          <House
            aria-hidden
            className={cn('size-7 opacity-70', iconClassName)}
          />
          {showLabel && (
            <span className="text-sm font-semibold opacity-80">
              {t('listings.noPhoto')}
            </span>
          )}
        </span>
      </div>
    );

  return (
    // eslint-disable-next-line @next/next/no-img-element -- Blob URLs come from any store host; next/image would need every host in next.config
    <img
      src={url}
      alt={alt}
      loading={eager ? 'eager' : 'lazy'}
      decoding="async"
      draggable={false}
      onError={() => setBroken(true)}
      className={cn('object-cover', className)}
    />
  );
}
