import { cn } from '@/lib/utils';

/** A list section's title with its count in a quiet pill (Today, owner detail). */
export function SectionHeading({
  id,
  title,
  count,
  action,
  className,
}: {
  id?: string;
  title: string;
  count?: number;
  action?: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        'flex min-h-11 items-center justify-between gap-3',
        className,
      )}
    >
      <h2
        id={id}
        className="flex min-w-0 items-center gap-2 text-base font-bold"
      >
        <span className="truncate">{title}</span>
        {count !== undefined && (
          <span className="rounded-pill bg-secondary px-2.5 font-numeric text-xs font-bold text-muted-foreground tabular-nums">
            {count.toLocaleString('en-US')}
          </span>
        )}
      </h2>
      {action}
    </div>
  );
}
