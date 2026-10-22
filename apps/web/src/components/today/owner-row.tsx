import { MapPin, Phone } from 'lucide-react';
import { Badge, type badgeVariants } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import type { VariantProps } from 'class-variance-authority';

/** Which marker the row carries at its start edge: red overdue, indigo due today, amber check-in. */
export type RowUrgency = 'overdue' | 'due' | 'checkIn' | 'none';

export interface OwnerRowProps {
  urgency: RowUrgency;
  name: string;
  area: string;
  status: {
    label: string;
    variant: VariantProps<typeof badgeVariants>['variant'];
    live?: boolean;
  };
  when: string;
  callLabel: string;
  onCall?: () => void;
}

const MARKER: Record<RowUrgency, string> = {
  overdue: 'bg-destructive',
  due: 'bg-primary',
  checkIn: 'bg-urgency',
  none: 'bg-border',
};

/** One owner in a Today list: urgency marker, who and where, status, when, and the Call action. */
export function OwnerRow({
  urgency,
  name,
  area,
  status,
  when,
  callLabel,
  onCall,
}: OwnerRowProps) {
  return (
    <div className="grid grid-cols-[auto_1fr_auto] items-center gap-3 rounded-md bg-card px-3 py-3.5 shadow-raised">
      <span
        aria-hidden
        className={cn('my-1 w-1.25 self-stretch rounded-pill', MARKER[urgency])}
      />
      <div className="grid min-w-0 gap-1">
        <div className="truncate text-[15.5px] font-bold">{name}</div>
        <div className="flex min-w-0 items-center gap-1.5 text-[13px] text-muted-foreground">
          <MapPin aria-hidden className="size-3.5 shrink-0" />
          <span className="truncate">{area}</span>
        </div>
        <div className="mt-0.5 flex flex-wrap items-center gap-1.5">
          <Badge variant={status.variant} dot={status.live ? 'live' : 'static'}>
            {status.label}
          </Badge>
          <span
            className={cn(
              'text-xs font-semibold text-muted-foreground',
              urgency === 'overdue' && 'text-destructive',
            )}
          >
            {when}
          </span>
        </div>
      </div>
      <Button className="h-12 ps-4 pe-5" onClick={onCall}>
        <Phone aria-hidden className="fill-current" />
        {callLabel}
      </Button>
    </div>
  );
}
