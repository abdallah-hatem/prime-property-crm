'use client';

import * as React from 'react';
import { Popover as PopoverPrimitive } from 'radix-ui';
import { cn } from '@/lib/utils';

const Popover = PopoverPrimitive.Root;
const PopoverTrigger = PopoverPrimitive.Trigger;

/** Grows from its trigger; capped at the space Radix measures, and scrolls itself. */
function PopoverContent({
  className,
  align = 'end',
  sideOffset = 8,
  ...props
}: React.ComponentProps<typeof PopoverPrimitive.Content>) {
  return (
    <PopoverPrimitive.Portal>
      <PopoverPrimitive.Content
        align={align}
        sideOffset={sideOffset}
        className={cn(
          'z-50 scrollbar-clean max-h-(--radix-popover-content-available-height) w-72 max-w-[calc(100vw-2rem)] overflow-y-auto overscroll-contain',
          'rounded-lg bg-popover p-4 text-popover-foreground shadow-float outline-none',
          'origin-(--radix-popover-content-transform-origin)',
          'data-[state=open]:animate-in data-[state=open]:duration-200 data-[state=open]:fade-in-0 data-[state=open]:zoom-in-95',
          'data-[state=closed]:animate-out data-[state=closed]:duration-150 data-[state=closed]:fade-out-0 data-[state=closed]:zoom-out-95',
          className,
        )}
        {...props}
      />
    </PopoverPrimitive.Portal>
  );
}

export { Popover, PopoverContent, PopoverTrigger };
