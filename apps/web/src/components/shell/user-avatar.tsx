import { cn } from '@/lib/utils';

/** Up to two initials, from the first two words of the name (works for Arabic names too). */
export function initialsOf(name: string): string {
  return name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((word) => [...word][0] ?? '')
    .join('')
    .toUpperCase();
}

/** The gradient avatar from the Today header: initials on the primary gradient, with the glow. */
export function UserAvatar({
  name,
  className,
}: {
  name: string;
  className?: string;
}) {
  return (
    <span
      aria-hidden
      className={cn(
        'grid size-11 shrink-0 place-items-center rounded-pill bg-primary-gradient text-sm font-bold text-primary-foreground shadow-glow',
        className,
      )}
    >
      {initialsOf(name)}
    </span>
  );
}
