import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';

/** A chart's card: its title (what is plotted), a line saying what it counts, then the chart. */
export function ChartCard({
  title,
  subtitle,
  testId,
  className,
  children,
}: {
  title: string;
  subtitle?: string;
  testId?: string;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <section
      data-testid={testId}
      aria-label={title}
      className={cn(
        'grid min-w-0 gap-4 rounded-lg bg-card p-5 shadow-raised',
        className,
      )}
    >
      <header className="grid gap-0.5">
        <h2 className="type-h2">{title}</h2>
        {subtitle && (
          <p className="text-[13px] text-muted-foreground">{subtitle}</p>
        )}
      </header>
      {children}
    </section>
  );
}

ChartCard.Skeleton = function ChartCardSkeleton({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="grid gap-4 rounded-lg bg-card p-5 shadow-raised">
      <div className="grid gap-1.5">
        <Skeleton className="h-5 w-32 rounded-pill" />
        <Skeleton className="h-3.5 w-48 rounded-pill" />
      </div>
      {children}
    </div>
  );
};
