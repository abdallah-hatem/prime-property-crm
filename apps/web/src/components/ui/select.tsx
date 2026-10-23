'use client';

import * as React from 'react';
import { Check, ChevronDown } from 'lucide-react';
import { Select as SelectPrimitive } from 'radix-ui';
import { cn } from '@/lib/utils';

/**
 * shadcn Select: a field-shaped trigger and a popover list that grows from it and scrolls itself.
 *
 * The list hangs below its trigger, trigger-wide and aligned to its reading start (so it mirrors
 * under Arabic), inside dialogs and sheets too. It opens above only when there is more room there
 * and too little below for a few rows. Radix's own collision flip turns it upward whenever the
 * whole list doesn't fit below, which on a phone sheet covers the very form it belongs to, so the
 * side is decided here, once, when the list opens, from where the trigger sits.
 */
type SelectSide = 'top' | 'bottom';

const SelectSideContext = React.createContext<{
  side: SelectSide;
  registerTrigger: (el: HTMLButtonElement | null) => void;
} | null>(null);

/**
 * Below wins when it can show this many pixels of list: two and a half rows, so the cut-off row
 * says the list scrolls. A select at the foot of a phone sheet still opens below its trigger.
 */
export const MIN_ROOM_BELOW = 120;

/** Pure: which side of its trigger a list opens on, from the room above and below the trigger. */
export function selectSideFor(
  roomAbove: number,
  roomBelow: number,
): SelectSide {
  return roomBelow >= MIN_ROOM_BELOW || roomBelow >= roomAbove
    ? 'bottom'
    : 'top';
}

function Select({
  onOpenChange,
  ...props
}: React.ComponentProps<typeof SelectPrimitive.Root>) {
  const trigger = React.useRef<HTMLButtonElement | null>(null);
  const [side, setSide] = React.useState<SelectSide>('bottom');
  const context = React.useMemo(
    () => ({
      side,
      registerTrigger: (el: HTMLButtonElement | null) => {
        trigger.current = el;
      },
    }),
    [side],
  );
  return (
    <SelectSideContext.Provider value={context}>
      <SelectPrimitive.Root
        onOpenChange={(open) => {
          const rect = trigger.current?.getBoundingClientRect();
          if (open && rect) {
            const viewport =
              window.visualViewport?.height ?? window.innerHeight;
            setSide(selectSideFor(rect.top, viewport - rect.bottom));
          }
          onOpenChange?.(open);
        }}
        {...props}
      />
    </SelectSideContext.Provider>
  );
}

const SelectGroup = SelectPrimitive.Group;
const SelectValue = SelectPrimitive.Value;

function SelectTrigger({
  className,
  children,
  ref,
  ...props
}: React.ComponentProps<typeof SelectPrimitive.Trigger>) {
  const registerTrigger = React.useContext(SelectSideContext)?.registerTrigger;
  return (
    <SelectPrimitive.Trigger
      ref={(el) => {
        registerTrigger?.(el);
        if (typeof ref === 'function') ref(el);
        else if (ref) ref.current = el;
      }}
      data-slot="select-trigger"
      className={cn(
        'flex h-11 w-full min-w-0 cursor-pointer items-center justify-between gap-2 rounded-sm border border-input bg-card px-4 text-start text-base text-foreground shadow-soft md:text-sm',
        'transition-[border-color,box-shadow] duration-200 ease-snappy',
        'outline-none focus-visible:border-ring focus-visible:ring-4 focus-visible:ring-ring/20',
        'disabled:cursor-not-allowed disabled:opacity-50 data-placeholder:text-muted-foreground',
        'aria-invalid:border-destructive aria-invalid:ring-4 aria-invalid:ring-destructive/15',
        '[&>span]:truncate',
        className,
      )}
      {...props}
    >
      {children}
      <SelectPrimitive.Icon asChild>
        <ChevronDown
          aria-hidden
          className="size-4 shrink-0 text-muted-foreground"
        />
      </SelectPrimitive.Icon>
    </SelectPrimitive.Trigger>
  );
}

function SelectContent({
  className,
  children,
  position = 'popper',
  ...props
}: React.ComponentProps<typeof SelectPrimitive.Content>) {
  const side = React.useContext(SelectSideContext)?.side ?? 'bottom';
  return (
    <SelectPrimitive.Portal>
      <SelectPrimitive.Content
        position={position}
        side={side}
        align="start"
        sideOffset={6}
        collisionPadding={8}
        // The side was chosen from the room around the trigger: no flip, no sideways slide.
        avoidCollisions={false}
        className={cn(
          'relative z-50 flex flex-col overflow-hidden',
          'w-(--radix-select-trigger-width) max-w-(--radix-select-content-available-width)',
          'max-h-[min(var(--radix-select-content-available-height),60dvh)]',
          'rounded-md bg-popover p-1 text-popover-foreground shadow-float',
          'origin-(--radix-select-content-transform-origin)',
          'data-[state=open]:animate-in data-[state=open]:duration-200 data-[state=open]:fade-in-0 data-[state=open]:zoom-in-95',
          'data-[state=closed]:animate-out data-[state=closed]:duration-150 data-[state=closed]:fade-out-0 data-[state=closed]:zoom-out-95',
          className,
        )}
        {...props}
      >
        <SelectPrimitive.Viewport className="scrollbar-clean max-h-72 min-h-0 overflow-y-auto overscroll-contain">
          {children}
        </SelectPrimitive.Viewport>
      </SelectPrimitive.Content>
    </SelectPrimitive.Portal>
  );
}

function SelectItem({
  className,
  children,
  ...props
}: React.ComponentProps<typeof SelectPrimitive.Item>) {
  return (
    <SelectPrimitive.Item
      className={cn(
        'relative flex min-h-11 cursor-pointer items-center gap-2 rounded-sm ps-3 pe-9 text-sm outline-none select-none',
        'data-highlighted:bg-accent data-highlighted:text-accent-foreground',
        'data-disabled:pointer-events-none data-disabled:opacity-40',
        className,
      )}
      {...props}
    >
      <SelectPrimitive.ItemText>{children}</SelectPrimitive.ItemText>
      <SelectPrimitive.ItemIndicator className="absolute end-3 grid place-items-center">
        <Check aria-hidden className="size-4" />
      </SelectPrimitive.ItemIndicator>
    </SelectPrimitive.Item>
  );
}

export {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
};
