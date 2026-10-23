'use client';

import Link from 'next/link';
import { BellRing } from 'lucide-react';
import type { ListingRow } from '@prime-crm/shared';
import { MoneyText } from '@/components/money-text';
import { StatusChip } from '@/components/status-chip';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { useTranslation } from '@/i18n/i18n-provider';
import { cn } from '@/lib/utils';
import { ListingCover } from './listing-cover';
import { ListingFactsLine } from './listing-facts';
import { UserText } from '@/components/user-text';

/** Price, with "a month" after a rent. */
export function ListingPrice({
  price,
  purpose,
  className,
  stacked = false,
}: {
  price: number;
  purpose: ListingRow['purpose'];
  className?: string;
  /** "a month" on its own line (narrow table cells). */
  stacked?: boolean;
}) {
  const { t } = useTranslation();
  return (
    <span className={cn(stacked && 'grid', className)}>
      <MoneyText value={price} />
      {purpose === 'RENT' && (
        <span
          className={cn(
            'text-[0.8em] font-semibold text-muted-foreground',
            !stacked && 'ms-1',
          )}
        >
          {t('listings.detail.perMonth')}
        </span>
      )}
    </span>
  );
}

/** Ad chip (only once the ad exists) and the amber "check-in due" flag. */
export function ListingChips({ row }: { row: ListingRow }) {
  const { t } = useTranslation();
  return (
    <span className="flex flex-wrap items-center gap-1.5">
      <StatusChip kind="listing" status={row.status} />
      {row.adStatus !== 'NOT_POSTED' && (
        <StatusChip kind="ad" status={row.adStatus} />
      )}
      {row.checkInDue && (
        <Badge variant="urgency" dot="none" data-testid="check-in-due">
          <BellRing aria-hidden />
          {t('listings.checkInDue')}
        </Badge>
      )}
    </span>
  );
}

/** One search result on a phone: cover photo, price, title, facts, chips. The whole card links. */
export function ListingRowCard({ row }: { row: ListingRow }) {
  return (
    <Link
      href={`/listings/${row.id}`}
      data-testid="listing-card"
      className="group grid overflow-hidden rounded-lg bg-card shadow-raised transition-transform duration-150 ease-snappy outline-none focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-ring active:scale-[0.99] motion-reduce:active:scale-100"
    >
      <div className="relative">
        <ListingCover
          url={row.coverPhotoUrl}
          alt={row.title}
          className="aspect-[16/9] w-full"
        />
        {row.checkInDue && (
          <span
            aria-hidden
            className="absolute start-3 top-3 size-3 rounded-pill bg-urgency ring-4 ring-card/70"
          />
        )}
      </div>
      <div className="grid min-w-0 gap-1.5 p-4">
        <ListingPrice
          price={row.price}
          purpose={row.purpose}
          className="text-xl font-extrabold tracking-tight"
        />
        <p className="truncate text-[15px] font-bold">
          <UserText>{row.title}</UserText>
        </p>
        {row.compound && (
          <p className="truncate text-[13px] text-muted-foreground">
            {row.compound}
          </p>
        )}
        <ListingFactsLine facts={row} />
        <div className="mt-1">
          <ListingChips row={row} />
        </div>
      </div>
    </Link>
  );
}

/** Same box as ListingRowCard. */
export function ListingRowCardSkeleton() {
  return (
    <div className="grid overflow-hidden rounded-lg bg-card shadow-raised">
      <Skeleton className="aspect-[16/9] w-full rounded-none" />
      <div className="grid gap-2.5 p-4">
        <Skeleton className="h-6 w-40 rounded-pill" />
        <Skeleton className="h-4 w-3/4 rounded-pill" />
        <Skeleton className="h-4 w-1/2 rounded-pill" />
        <Skeleton className="h-5 w-28 rounded-pill" />
      </div>
    </div>
  );
}
