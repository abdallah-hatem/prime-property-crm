import { ListCardSkeleton, PageHeaderSkeleton } from '@/components/skeletons';
import { Skeleton } from '@/components/ui/skeleton';

/** An admin list while it loads: header, its filter row, a page of cards / table rows. */
export function AdminListSkeleton({
  filters = 1,
  chips = 0,
}: {
  /** Field-shaped filters (search, selects). */
  filters?: number;
  /** Pill filters under them. */
  chips?: number;
}) {
  return (
    <div className="grid gap-5" aria-busy>
      <PageHeaderSkeleton />
      <div className="grid gap-3 md:grid-cols-3">
        {Array.from({ length: filters }, (_, i) => (
          <Skeleton key={i} className="h-11 rounded-sm" />
        ))}
      </div>
      {chips > 0 && (
        <div className="flex gap-2 overflow-hidden">
          {Array.from({ length: chips }, (_, i) => (
            <Skeleton key={i} className="h-11 w-24 shrink-0 rounded-pill" />
          ))}
        </div>
      )}
      <div className="grid gap-2.5 md:hidden">
        {Array.from({ length: 6 }, (_, i) => (
          <ListCardSkeleton key={i} lines={2} />
        ))}
      </div>
      <div className="hidden gap-4 rounded-lg bg-card p-5 shadow-raised md:grid">
        {Array.from({ length: 8 }, (_, i) => (
          <Skeleton key={i} className="h-5 rounded-pill" />
        ))}
      </div>
    </div>
  );
}

/** Role cards while they load. */
export function RolesSkeleton() {
  return (
    <div className="grid gap-5" aria-busy>
      <PageHeaderSkeleton />
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        {Array.from({ length: 3 }, (_, i) => (
          <div
            key={i}
            className="grid gap-4 rounded-lg bg-card p-5 shadow-raised"
          >
            <Skeleton className="h-6 w-32 rounded-pill" />
            <Skeleton className="h-4 w-44 rounded-pill" />
            <div className="flex gap-1.5">
              <Skeleton className="h-6 w-24 rounded-pill" />
              <Skeleton className="h-6 w-20 rounded-pill" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

/** The two settings panels while they load. */
export function SettingsSkeleton() {
  return (
    <div className="grid gap-5" aria-busy>
      <PageHeaderSkeleton />
      <div className="grid items-start gap-5 xl:grid-cols-[minmax(0,1fr)_minmax(0,1.6fr)]">
        <div className="grid gap-4 rounded-lg bg-card p-6 shadow-raised">
          <Skeleton className="h-6 w-48 rounded-pill" />
          <Skeleton className="h-14 rounded-md" />
          <Skeleton className="h-11 w-60 rounded-sm" />
        </div>
        <div className="grid gap-3 rounded-lg bg-card p-6 shadow-raised">
          <Skeleton className="h-6 w-40 rounded-pill" />
          {Array.from({ length: 6 }, (_, i) => (
            <Skeleton key={i} className="h-16 rounded-md" />
          ))}
        </div>
      </div>
    </div>
  );
}
