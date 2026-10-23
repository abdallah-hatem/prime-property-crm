import { PageHeaderSkeleton } from '@/components/skeletons';
import { OwnerRowSkeleton } from '@/components/today/owner-row';
import { Skeleton } from '@/components/ui/skeleton';

/** Reminders while they load: header, the "Show" pills, a page of rows. */
export default function Loading() {
  return (
    <div className="grid gap-5">
      <PageHeaderSkeleton />
      <div className="flex gap-2 overflow-hidden">
        {[16, 20, 16, 22, 16].map((w, i) => (
          <Skeleton
            key={i}
            className="h-11 shrink-0 rounded-pill"
            style={{ width: `${w * 4}px` }}
          />
        ))}
      </div>
      <div className="grid gap-2.5">
        {Array.from({ length: 6 }, (_, i) => (
          <OwnerRowSkeleton key={i} />
        ))}
      </div>
    </div>
  );
}
