import type { LucideIcon } from 'lucide-react';
import { cn } from '@/lib/utils';

/**
 * What a screen, list or picker shows when it has nothing: an icon, what's missing, and what to
 * do about it (`action`). Also used for the error state, with `tone="error"`.
 */
export function EmptyState({
  icon: Icon,
  title,
  body,
  action,
  tone = 'neutral',
  className,
}: {
  icon?: LucideIcon;
  title: string;
  body?: string;
  action?: React.ReactNode;
  tone?: 'neutral' | 'error';
  className?: string;
}) {
  return (
    <div
      role={tone === 'error' ? 'alert' : undefined}
      className={cn(
        'flex flex-col items-center gap-3 rounded-lg bg-card px-6 py-10 text-center shadow-raised',
        className,
      )}
    >
      {Icon && (
        <span
          aria-hidden
          className={cn(
            'grid size-14 place-items-center rounded-pill',
            tone === 'error'
              ? 'bg-destructive-soft text-destructive'
              : 'bg-primary-soft text-primary-soft-foreground',
          )}
        >
          <Icon className="size-6" />
        </span>
      )}
      <div className="grid max-w-sm gap-1">
        <p className="type-h2">{title}</p>
        {body && <p className="text-sm text-muted-foreground">{body}</p>}
      </div>
      {action}
    </div>
  );
}
