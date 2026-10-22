import { cn } from '@/lib/utils';

/**
 * The top of every screen: its title, an optional line under it (a date, a count), and its
 * actions at the end edge. One primary action at most.
 */
export function PageHeader({
  title,
  description,
  actions,
  className,
}: {
  title: string;
  description?: React.ReactNode;
  actions?: React.ReactNode;
  className?: string;
}) {
  return (
    <header
      className={cn(
        'flex flex-wrap items-end justify-between gap-x-4 gap-y-3',
        className,
      )}
    >
      <div className="grid min-w-0 gap-1">
        {description && (
          <p className="text-[13px] font-semibold text-muted-foreground">
            {description}
          </p>
        )}
        <h1 className="type-h1 break-words">{title}</h1>
      </div>
      {actions && (
        <div className="flex shrink-0 flex-wrap items-center gap-2">
          {actions}
        </div>
      )}
    </header>
  );
}
