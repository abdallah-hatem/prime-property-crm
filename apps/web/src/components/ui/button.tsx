import * as React from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { Slot } from 'radix-ui';
import { cn } from '@/lib/utils';

/**
 * Pill buttons. `default` carries the primary gradient: one per view, for the act
 * (Call, Save). Press scales to 97% and the glow settles in 200ms, ease-out; nothing bounces.
 */
const buttonVariants = cva(
  [
    'inline-flex shrink-0 cursor-pointer items-center justify-center gap-2 rounded-pill font-bold whitespace-nowrap select-none',
    'transition-[transform,box-shadow,background-color,color,filter] duration-200 ease-snappy',
    'active:scale-[0.97] motion-reduce:active:scale-100',
    'outline-none focus-visible:outline-3 focus-visible:outline-offset-3 focus-visible:outline-ring',
    'disabled:cursor-not-allowed disabled:opacity-50 disabled:active:scale-100',
    "[&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-[18px]",
  ],
  {
    variants: {
      variant: {
        default:
          'bg-primary-gradient text-primary-foreground shadow-glow hover:brightness-110 active:shadow-none',
        soft: 'bg-primary-soft text-primary-soft-foreground hover:bg-primary-soft/80',
        secondary:
          'bg-secondary text-secondary-foreground hover:bg-secondary/70',
        outline:
          'border border-border bg-card text-foreground shadow-soft hover:bg-accent hover:text-accent-foreground',
        ghost: 'text-foreground hover:bg-accent hover:text-accent-foreground',
        inverse: 'bg-foreground text-background hover:bg-foreground/90',
        destructive:
          'bg-destructive text-destructive-foreground hover:bg-destructive/90',
        link: 'h-auto rounded-sm px-0 text-primary underline-offset-4 hover:underline active:scale-100',
      },
      size: {
        default: 'h-11 px-5 text-sm',
        sm: 'h-9 px-4 text-[13px]',
        lg: 'h-13 px-6 text-base',
        icon: 'size-11',
        'icon-sm': 'size-9',
        'icon-lg': 'size-13',
      },
    },
    defaultVariants: {
      variant: 'default',
      size: 'default',
    },
  },
);

function Button({
  className,
  variant = 'default',
  size = 'default',
  asChild = false,
  ...props
}: React.ComponentProps<'button'> &
  VariantProps<typeof buttonVariants> & {
    asChild?: boolean;
  }) {
  const Comp = asChild ? Slot.Root : 'button';

  return (
    <Comp
      data-slot="button"
      data-variant={variant}
      data-size={size}
      className={cn(buttonVariants({ variant, size, className }))}
      {...props}
    />
  );
}

export { Button, buttonVariants };
