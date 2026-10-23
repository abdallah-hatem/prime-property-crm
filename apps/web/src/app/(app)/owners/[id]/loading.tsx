import { SectionHeadingSkeleton } from '@/components/skeletons';
import { Skeleton } from '@/components/ui/skeleton';

const Card = ({ lines }: { lines: number }) => (
  <div className="grid gap-3 rounded-lg bg-card p-4 shadow-raised md:p-5">
    <SectionHeadingSkeleton />
    {Array.from({ length: lines }, (_, i) => (
      <Skeleton key={i} className="h-13 rounded-md" />
    ))}
  </div>
);

/** Owner detail while it loads: back link, the owner card, phones, reminders, notes, history. */
export default function Loading() {
  return (
    <div className="grid gap-5">
      <Skeleton className="h-11 w-24 rounded-pill" />
      <div className="grid gap-5 lg:grid-cols-2 lg:items-start">
        <div className="grid gap-5">
          <div className="grid gap-4 rounded-lg bg-card p-4 shadow-raised md:p-5">
            <Skeleton className="h-8 w-2/3 rounded-pill" />
            <Skeleton className="h-5 w-1/2 rounded-pill" />
            <Skeleton className="h-13 rounded-pill" />
          </div>
          <Card lines={1} />
          <Card lines={2} />
        </div>
        <div className="grid gap-5">
          <Card lines={2} />
          <Card lines={3} />
        </div>
      </div>
    </div>
  );
}
