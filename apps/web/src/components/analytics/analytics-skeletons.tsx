import { ListCardSkeleton, PageHeaderSkeleton } from '@/components/skeletons';
import { Skeleton } from '@/components/ui/skeleton';
import { CallsByDayChartSkeleton } from './calls-by-day-chart';
import { OutcomesChartSkeleton } from './outcomes-chart';
import { StatTilesSkeleton } from './stat-tiles';

/** The range pills' row. */
function RangeFilterSkeleton() {
  return (
    <div className="flex gap-2 overflow-hidden">
      {[64, 84, 92, 104, 96, 108, 88].map((width, i) => (
        <Skeleton
          key={i}
          className="h-11 shrink-0 rounded-pill"
          style={{ width }}
        />
      ))}
    </div>
  );
}

/** `/analytics` while it loads: header, range, tiles, the outcomes card and member rows. */
export function AnalyticsSkeleton() {
  return (
    <div className="grid grid-cols-1 gap-5" aria-busy>
      <PageHeaderSkeleton />
      <RangeFilterSkeleton />
      <div className="grid gap-3">
        <div className="grid gap-1.5">
          <Skeleton className="h-5 w-28 rounded-pill" />
          <Skeleton className="h-3.5 w-64 max-w-full rounded-pill" />
        </div>
        <StatTilesSkeleton />
      </div>
      <OutcomesChartSkeleton />
      <div className="grid gap-3">
        <div className="flex items-end justify-between">
          <Skeleton className="h-5 w-24 rounded-pill" />
          <Skeleton className="h-11 w-60 rounded-sm" />
        </div>
        <div className="grid gap-2.5">
          {[0, 1, 2, 3].map((i) => (
            <ListCardSkeleton key={i} lines={2} />
          ))}
        </div>
      </div>
    </div>
  );
}

/** A member's analytics while it loads. */
export function MemberAnalyticsSkeleton() {
  return (
    <div className="grid grid-cols-1 gap-5" aria-busy>
      <Skeleton className="h-9 w-36 rounded-pill" />
      <PageHeaderSkeleton />
      <RangeFilterSkeleton />
      <StatTilesSkeleton />
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
        <CallsByDayChartSkeleton />
        <OutcomesChartSkeleton />
      </div>
    </div>
  );
}
