import { PageHeaderSkeleton } from '@/components/skeletons';
import { Skeleton } from '@/components/ui/skeleton';
import { ListingRowCardSkeleton } from './listing-row-card';

/** /listings first paint: header, search bar, and a page of result cards (rows from md up). */
export function ListingSearchSkeleton() {
  return (
    <div className="grid grid-cols-1 gap-5" aria-busy>
      <PageHeaderSkeleton />
      <div className="flex gap-2">
        <Skeleton className="h-11 flex-1 rounded-pill" />
        <Skeleton className="h-11 w-28 rounded-pill xl:hidden" />
      </div>
      <div className="grid gap-2.5 md:hidden">
        {Array.from({ length: 3 }, (_, i) => (
          <ListingRowCardSkeleton key={i} />
        ))}
      </div>
      <div className="hidden gap-3 rounded-lg bg-card p-4 shadow-raised md:grid">
        {Array.from({ length: 8 }, (_, i) => (
          <div key={i} className="flex items-center gap-3">
            <Skeleton className="h-12 w-16 rounded-sm" />
            <Skeleton className="h-4 flex-1 rounded-pill" />
            <Skeleton className="h-4 w-24 rounded-pill" />
          </div>
        ))}
      </div>
    </div>
  );
}

/** /listings/[id] first paint, in the detail's shape: photo, price sheet, fact tiles, cards. */
export function ListingDetailSkeleton() {
  return (
    <div
      className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1fr)_21rem] lg:items-start"
      aria-busy
    >
      <Skeleton className="-mx-4 -mt-2 h-80 rounded-none md:mx-0 md:mt-0 md:h-96 md:rounded-lg" />
      <div className="grid gap-4">
        <Skeleton className="h-9 w-48 rounded-pill" />
        <Skeleton className="h-5 w-2/3 rounded-pill" />
        <div className="grid grid-cols-4 gap-2">
          {Array.from({ length: 4 }, (_, i) => (
            <Skeleton key={i} className="h-16 rounded-md" />
          ))}
        </div>
        <Skeleton className="h-52 rounded-lg" />
        <Skeleton className="h-20 rounded-lg" />
      </div>
    </div>
  );
}

/** /listings/new and /edit first paint: title and the form's sections. */
export function ListingFormSkeleton() {
  return (
    <div className="mx-auto grid w-full max-w-2xl gap-6" aria-busy>
      <PageHeaderSkeleton />
      {Array.from({ length: 3 }, (_, i) => (
        <div
          key={i}
          className="grid gap-4 rounded-lg bg-card p-5 shadow-raised"
        >
          <Skeleton className="h-5 w-32 rounded-pill" />
          <Skeleton className="h-11 rounded-sm" />
          <Skeleton className="h-11 rounded-sm" />
        </div>
      ))}
    </div>
  );
}
