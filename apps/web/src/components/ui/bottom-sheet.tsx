'use client';

import { X } from 'lucide-react';
import { Dialog as DialogPrimitive } from 'radix-ui';
import { cn } from '@/lib/utils';

/**
 * A sheet that rises from the bottom on phones (28px top corners, dvh-capped). Header and footer
 * stay put; only the body scrolls. Built on the Radix dialog like `ui/dialog`, whose `variant="sheet"`
 * is the other shape (a sheet on phones that becomes a dialog from md).
 */
export function BottomSheet({
  open,
  onOpenChange,
  title,
  closeLabel,
  footer,
  children,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  closeLabel: string;
  footer?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <DialogPrimitive.Root open={open} onOpenChange={onOpenChange}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay
          className={cn(
            'fixed inset-0 z-50 bg-foreground/30 backdrop-blur-[2px]',
            'data-[state=open]:animate-in data-[state=open]:duration-200 data-[state=open]:fade-in-0',
            'data-[state=closed]:animate-out data-[state=closed]:duration-150 data-[state=closed]:fade-out-0',
          )}
        />
        <DialogPrimitive.Content
          aria-describedby={undefined}
          className={cn(
            'fixed inset-x-0 bottom-0 z-50 mx-auto flex max-h-[calc(100dvh-2rem)] w-full max-w-xl flex-col',
            'rounded-t-xl bg-background text-foreground shadow-float outline-none',
            'data-[state=open]:animate-in data-[state=open]:duration-250 data-[state=open]:slide-in-from-bottom',
            'data-[state=closed]:animate-out data-[state=closed]:duration-150 data-[state=closed]:slide-out-to-bottom',
            'motion-reduce:data-[state=closed]:slide-out-to-bottom-0 motion-reduce:data-[state=open]:slide-in-from-bottom-0',
          )}
        >
          <span
            aria-hidden
            className="mx-auto mt-2.5 h-1.25 w-10 shrink-0 rounded-pill bg-border"
          />
          <div className="flex shrink-0 items-center justify-between gap-3 px-5 pt-2 pb-3">
            <DialogPrimitive.Title className="type-h2">
              {title}
            </DialogPrimitive.Title>
            <DialogPrimitive.Close
              aria-label={closeLabel}
              className="grid size-11 cursor-pointer place-items-center rounded-pill text-muted-foreground transition-colors duration-150 hover:bg-accent hover:text-accent-foreground"
            >
              <X aria-hidden className="size-5" />
            </DialogPrimitive.Close>
          </div>
          <div className="mx-1.5 scrollbar-clean min-h-0 flex-1 overflow-y-auto overscroll-contain px-3.5 pb-4">
            {children}
          </div>
          {footer && (
            <div className="flex shrink-0 gap-2 border-t border-border px-5 pt-3 pb-[calc(1rem+env(safe-area-inset-bottom))]">
              {footer}
            </div>
          )}
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}
