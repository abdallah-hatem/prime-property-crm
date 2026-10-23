import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';

/** Same box as DataList's default phone card: two to three label / value lines. */
export function ListCardSkeleton({ lines = 3 }: { lines?: number }) {
  return (
    <div className="grid gap-3 rounded-md bg-card p-4 shadow-raised">
      {Array.from({ length: lines }, (_, i) => (
        <div key={i} className="flex items-center justify-between gap-3">
          <Skeleton className="h-3 w-16 rounded-pill" />
          <Skeleton className="h-4 w-1/3 rounded-pill" />
        </div>
      ))}
    </div>
  );
}

/** Same box as PageHeader: a short caption line over the title. */
export function PageHeaderSkeleton({ className }: { className?: string }) {
  return (
    <div className={cn('grid gap-2', className)}>
      <Skeleton className="h-4 w-28 rounded-pill" />
      <Skeleton className="h-8 w-48 rounded-pill" />
    </div>
  );
}

/** A screen's first paint: its header and a page of list cards. */
export function PageSkeleton({ rows = 6 }: { rows?: number }) {
  return (
    <div className="grid gap-6">
      <PageHeaderSkeleton />
      <div className="grid gap-2.5">
        {Array.from({ length: rows }, (_, i) => (
          <ListCardSkeleton key={i} lines={2} />
        ))}
      </div>
    </div>
  );
}

/** Same box as the Today counter board: three counters. */
export function CounterBoardSkeleton() {
  return (
    <div className="grid grid-cols-3 gap-2">
      {[0, 1, 2].map((i) => (
        <div
          key={i}
          className="grid gap-2 rounded-md bg-card px-3 pt-3 pb-2.5 shadow-raised"
        >
          <Skeleton className="h-7 w-10 rounded-pill" />
          <Skeleton className="h-3 w-16 rounded-pill" />
        </div>
      ))}
    </div>
  );
}

/** A section heading with its count pill. */
export function SectionHeadingSkeleton() {
  return (
    <div className="flex min-h-11 items-center gap-2">
      <Skeleton className="h-4 w-28 rounded-pill" />
      <Skeleton className="h-4 w-7 rounded-pill" />
    </div>
  );
}
