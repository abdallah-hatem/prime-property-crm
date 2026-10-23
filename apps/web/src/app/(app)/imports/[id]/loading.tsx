import { ListCardSkeleton, PageHeaderSkeleton } from '@/components/skeletons';

/** One import while it loads: the header and a page of issue cards. */
export default function Loading() {
  return (
    <div className="grid gap-5">
      <PageHeaderSkeleton />
      <div className="grid gap-2.5">
        {Array.from({ length: 6 }, (_, i) => (
          <ListCardSkeleton key={i} lines={3} />
        ))}
      </div>
    </div>
  );
}
