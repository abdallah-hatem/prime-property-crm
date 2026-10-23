import {
  CounterBoardSkeleton,
  PageHeaderSkeleton,
  SectionHeadingSkeleton,
} from '@/components/skeletons';
import { OwnerRowSkeleton } from '@/components/today/owner-row';

/** Today's shape while it renders: header, counters, a section of owner rows. */
export default function Loading() {
  return (
    <div className="grid gap-6">
      <div className="grid gap-4">
        <PageHeaderSkeleton />
        <CounterBoardSkeleton />
      </div>
      <div className="grid gap-2.5">
        <SectionHeadingSkeleton />
        {Array.from({ length: 5 }, (_, i) => (
          <OwnerRowSkeleton key={i} />
        ))}
      </div>
    </div>
  );
}
