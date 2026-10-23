import { PageHeaderSkeleton } from '@/components/skeletons';
import { Skeleton } from '@/components/ui/skeleton';

/** The wizard while it loads: header, the four steps, the drop zone. */
export default function Loading() {
  return (
    <div className="grid gap-6">
      <PageHeaderSkeleton />
      <div className="flex items-center gap-2">
        {Array.from({ length: 4 }, (_, i) => (
          <Skeleton key={i} className="size-8 shrink-0 rounded-pill" />
        ))}
      </div>
      <Skeleton className="h-64 rounded-lg" />
    </div>
  );
}
