import { cn } from '@/lib/utils';

/** A tracing of the real thing: same size and radius, a slow pulse (never faster than ~1.5s). */
function Skeleton({ className, ...props }: React.ComponentProps<'div'>) {
  return (
    <div
      data-slot="skeleton"
      aria-hidden
      className={cn(
        'animate-pulse rounded-sm bg-secondary [animation-duration:1.8s] motion-reduce:animate-none',
        className,
      )}
      {...props}
    />
  );
}

export { Skeleton };
