import Link from 'next/link';
import { MapPin, Phone, StickyNote, type LucideIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';

/** Which marker the row carries at its start edge: red overdue, indigo due today, amber check-in. */
export type RowUrgency = 'overdue' | 'due' | 'checkIn' | 'none';

export interface OwnerRowProps {
  urgency: RowUrgency;
  /** Owner name or task title; one line, cut with an ellipsis (the full text stays in `title`). */
  name: string;
  /** Opens the owner (or listing) when the row's text is tapped. */
  href?: string;
  /** The second line: the area by default, or a reminder's note (`detailIcon="note"`). */
  detail?: string | null;
  detailIcon?: 'area' | 'note';
  /** A status chip (`<StatusChip>`, `<Badge>`). */
  status?: React.ReactNode;
  when?: string;
  /** The end-edge action, usually `<CallButton>`. Without it, `callLabel` draws a plain Call pill. */
  action?: React.ReactNode;
  callLabel?: string;
  onCall?: () => void;
  className?: string;
}

const MARKER: Record<RowUrgency, string> = {
  overdue: 'bg-destructive',
  due: 'bg-primary',
  checkIn: 'bg-urgency',
  none: 'bg-border',
};

const DETAIL_ICON: Record<'area' | 'note', LucideIcon> = {
  area: MapPin,
  note: StickyNote,
};

/**
 * One row of a calling list: urgency marker at the start edge, who and where, status, when, and
 * the Call action at the end edge. Text never pushes the action off the row.
 */
export function OwnerRow({
  urgency,
  name,
  href,
  detail,
  detailIcon = 'area',
  status,
  when,
  action,
  callLabel,
  onCall,
  className,
}: OwnerRowProps) {
  const DetailIcon = DETAIL_ICON[detailIcon];
  const body = (
    <>
      <div title={name} className="truncate text-[15.5px] font-bold">
        <bdi>{name}</bdi>
      </div>
      {detail && (
        <div className="flex min-w-0 items-center gap-1.5 text-[13px] text-muted-foreground">
          <DetailIcon aria-hidden className="size-3.5 shrink-0" />
          <span className="truncate">
            <bdi>{detail}</bdi>
          </span>
        </div>
      )}
      {(status || when) && (
        <div className="mt-0.5 flex min-w-0 flex-wrap items-center gap-1.5">
          {status}
          {when && (
            <span
              className={cn(
                'text-xs font-semibold text-muted-foreground',
                urgency === 'overdue' && 'text-destructive',
              )}
            >
              {when}
            </span>
          )}
        </div>
      )}
    </>
  );

  return (
    <div
      data-testid="owner-row"
      className={cn(
        'grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-3 rounded-md bg-card px-3 py-3.5 shadow-raised',
        className,
      )}
    >
      <span
        aria-hidden
        className={cn('my-1 w-1.25 self-stretch rounded-pill', MARKER[urgency])}
      />
      {href ? (
        <Link
          href={href}
          className="-my-2 grid min-w-0 gap-1 rounded-sm py-2 outline-none focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-ring"
        >
          {body}
        </Link>
      ) : (
        <div className="grid min-w-0 gap-1">{body}</div>
      )}
      {action ??
        (callLabel && (
          <Button className="h-12 ps-4 pe-5" onClick={onCall}>
            <Phone aria-hidden className="fill-current" />
            {callLabel}
          </Button>
        ))}
    </div>
  );
}

/** Same box as OwnerRow: marker, three lines, the Call pill. */
export function OwnerRowSkeleton({ action = true }: { action?: boolean }) {
  return (
    <div className="grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-3 rounded-md bg-card px-3 py-3.5 shadow-raised">
      <Skeleton className="my-1 w-1.25 self-stretch rounded-pill" />
      <div className="grid gap-2">
        <Skeleton className="h-4 w-2/3 rounded-pill" />
        <Skeleton className="h-3 w-1/2 rounded-pill" />
        <Skeleton className="h-5 w-24 rounded-pill" />
      </div>
      {action && <Skeleton className="h-12 w-24 rounded-pill" />}
    </div>
  );
}
