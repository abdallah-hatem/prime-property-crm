import * as React from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { Slot } from 'radix-ui';
import { cn } from '@/lib/utils';

/** Pill chips for statuses. A leading dot in the chip's own colour; `live` ripples softly. */
const badgeVariants = cva(
  [
    'inline-flex w-fit shrink-0 items-center gap-1.5 overflow-hidden rounded-pill px-2.5 py-0.5',
    'text-xs leading-5 font-semibold whitespace-nowrap',
    '[&>svg]:pointer-events-none [&>svg]:size-3',
  ],
  {
    variants: {
      variant: {
        neutral: 'bg-secondary text-secondary-foreground',
        primary: 'bg-primary-soft text-primary-soft-foreground',
        success: 'bg-success-soft text-success',
        warning: 'bg-warning-soft text-warning',
        urgency: 'bg-urgency-soft text-warning',
        destructive: 'bg-destructive-soft text-destructive',
        solid: 'bg-primary text-primary-foreground',
        outline: 'border border-border text-foreground',
      },
      dot: {
        none: '',
        static: 'before:size-1.5 before:rounded-full before:bg-current',
        live: 'before:size-1.5 before:animate-ping-soft before:rounded-full before:bg-current',
      },
    },
    defaultVariants: {
      variant: 'neutral',
      dot: 'static',
    },
  },
);

function Badge({
  className,
  variant = 'neutral',
  dot = 'static',
  asChild = false,
  ...props
}: React.ComponentProps<'span'> &
  VariantProps<typeof badgeVariants> & { asChild?: boolean }) {
  const Comp = asChild ? Slot.Root : 'span';

  return (
    <Comp
      data-slot="badge"
      data-variant={variant}
      className={cn(badgeVariants({ variant, dot }), className)}
      {...props}
    />
  );
}

export { Badge, badgeVariants };
