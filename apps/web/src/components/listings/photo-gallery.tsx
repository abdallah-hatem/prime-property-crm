'use client';

import { useRef, useState } from 'react';
import Link from 'next/link';
import { ArrowLeft, ChevronLeft, ChevronRight } from 'lucide-react';
import type { Photo } from '@prime-crm/shared';
import { useTranslation } from '@/i18n/i18n-provider';
import { cn } from '@/lib/utils';
import { ListingCover } from './listing-cover';

const overlayButton =
  'grid size-11 cursor-pointer place-items-center rounded-pill bg-card/85 text-foreground shadow-raised backdrop-blur-md transition-transform duration-150 ease-snappy active:scale-[0.97] motion-reduce:active:scale-100 outline-none focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-ring';

/**
 * The listing's photos as a swipeable strip (native scroll snapping, so phones swipe and
 * keyboards scroll), with the back button over it, a "3 / 12" counter, and previous / next
 * buttons on screens with a pointer. With no photos it shows the soft placeholder.
 */
export function PhotoGallery({
  photos,
  title,
}: {
  photos: readonly Photo[];
  title: string;
}) {
  const { t, dir } = useTranslation();
  const strip = useRef<HTMLDivElement>(null);
  const [index, setIndex] = useState(0);
  const total = photos.length;

  function onScroll() {
    const el = strip.current;
    if (!el || el.clientWidth === 0) return;
    setIndex(Math.round(Math.abs(el.scrollLeft) / el.clientWidth));
  }

  function go(step: 1 | -1) {
    const el = strip.current;
    if (!el) return;
    const sign = dir === 'rtl' ? -1 : 1;
    el.scrollBy({ left: step * sign * el.clientWidth, behavior: 'smooth' });
  }

  return (
    <div
      className="relative -mx-4 -mt-2 overflow-hidden bg-secondary md:mx-0 md:mt-0 md:rounded-lg md:shadow-raised"
      data-testid="photo-gallery"
    >
      {total === 0 ? (
        <ListingCover
          url={null}
          alt={title}
          showLabel
          className="h-72 w-full md:h-96"
          iconClassName="size-10"
        />
      ) : (
        <div
          ref={strip}
          onScroll={onScroll}
          tabIndex={0}
          aria-label={title}
          aria-roledescription="carousel"
          className="flex h-80 snap-x snap-mandatory [scrollbar-width:none] overflow-x-auto overscroll-x-contain outline-none md:h-[26rem] [&::-webkit-scrollbar]:hidden"
        >
          {photos.map((photo, i) => (
            <div
              key={photo.id}
              className="h-full w-full shrink-0 snap-center"
              aria-roledescription="slide"
              aria-label={t('listings.photoAlt', { index: i + 1, total })}
            >
              <ListingCover
                url={photo.url}
                alt={t('listings.photoAlt', { index: i + 1, total })}
                eager={i === 0}
                className="h-full w-full"
              />
            </div>
          ))}
        </div>
      )}

      <div className="pointer-events-none absolute inset-x-4 top-4 flex justify-between">
        <Link
          href="/listings"
          aria-label={t('listings.detail.back')}
          className={cn(overlayButton, 'pointer-events-auto')}
          data-testid="listing-back"
        >
          <ArrowLeft aria-hidden className="size-5 flip-rtl" />
        </Link>
      </div>

      {total > 1 && (
        <>
          <div className="pointer-events-none absolute inset-x-4 top-1/2 hidden -translate-y-1/2 justify-between pointer-fine:flex">
            <button
              type="button"
              aria-label={t('listings.detail.previousPhoto')}
              disabled={index === 0}
              onClick={() => go(-1)}
              className={cn(
                overlayButton,
                'pointer-events-auto disabled:cursor-not-allowed disabled:opacity-0',
              )}
            >
              <ChevronLeft aria-hidden className="size-5 flip-rtl" />
            </button>
            <button
              type="button"
              aria-label={t('listings.detail.nextPhoto')}
              disabled={index >= total - 1}
              onClick={() => go(1)}
              className={cn(
                overlayButton,
                'pointer-events-auto disabled:cursor-not-allowed disabled:opacity-0',
              )}
            >
              <ChevronRight aria-hidden className="size-5 flip-rtl" />
            </button>
          </div>
          <span
            aria-live="polite"
            className="absolute end-4 bottom-10 rounded-pill bg-foreground/60 px-2.5 py-1 font-numeric text-xs font-bold text-background tabular-nums backdrop-blur-md md:bottom-4"
          >
            <bdi>
              {t('listings.detail.photoCount', { index: index + 1, total })}
            </bdi>
          </span>
        </>
      )}
    </div>
  );
}
