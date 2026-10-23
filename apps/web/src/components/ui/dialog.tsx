'use client';

import * as React from 'react';
import { X } from 'lucide-react';
import { Dialog as DialogPrimitive } from 'radix-ui';
import { cn } from '@/lib/utils';

/**
 * shadcn Dialog, sized by content: pick `size` from the widest thing inside. Every size is capped
 * at the viewport on both axes (dvh, so the footer never hides under a phone's toolbar); only the
 * body scrolls, header and footer stay put.
 */
export const dialogSizes = {
  sm: 'sm:max-w-md',
  md: 'sm:max-w-lg',
  lg: 'sm:max-w-3xl',
  xl: 'sm:max-w-5xl',
} as const;
export type DialogSize = keyof typeof dialogSizes;
/** A sheet is full width on phones and takes its size from md up. */
const sheetSizes: Record<DialogSize, string> = {
  sm: 'md:max-w-md',
  md: 'md:max-w-lg',
  lg: 'md:max-w-3xl',
  xl: 'md:max-w-5xl',
};

/**
 * `dialog`: centred card. `sheet`: a bottom sheet on phones (slides up 250ms, closes 150ms, a grab
 * handle, the home-indicator inset below its footer) and the same centred card from md up.
 */
const variants = {
  dialog: cn(
    'inset-x-0 top-1/2 mx-auto -translate-y-1/2 rounded-lg',
    'max-h-[calc(100dvh-2rem)] max-w-[calc(100vw-2rem)]',
    'data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95',
  ),
  sheet: cn(
    'inset-x-0 bottom-0 rounded-t-xl pb-[env(safe-area-inset-bottom)]',
    'max-h-[calc(100dvh-1rem)]',
    'data-[state=closed]:slide-out-to-bottom data-[state=open]:duration-250 data-[state=open]:slide-in-from-bottom',
    'md:top-1/2 md:bottom-auto md:mx-auto md:max-h-[calc(100dvh-2rem)] md:max-w-[calc(100vw-2rem)] md:-translate-y-1/2 md:rounded-lg md:pb-0',
    'md:data-[state=closed]:slide-out-to-bottom-0 md:data-[state=closed]:zoom-out-95 md:data-[state=open]:slide-in-from-bottom-0 md:data-[state=open]:zoom-in-95',
  ),
} as const;
export type DialogVariant = keyof typeof variants;

const Dialog = DialogPrimitive.Root;
const DialogTrigger = DialogPrimitive.Trigger;
const DialogClose = DialogPrimitive.Close;

function DialogContent({
  className,
  children,
  size = 'md',
  variant = 'dialog',
  closeLabel,
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Content> & {
  size?: DialogSize;
  variant?: DialogVariant;
  /** Accessible name of the corner close button; omit to hide the button. */
  closeLabel?: string;
}) {
  return (
    <DialogPrimitive.Portal>
      <DialogPrimitive.Overlay
        className={cn(
          'fixed inset-0 z-50 bg-foreground/30 backdrop-blur-[2px]',
          'data-[state=open]:animate-in data-[state=open]:duration-200 data-[state=open]:fade-in-0',
          'data-[state=closed]:animate-out data-[state=closed]:duration-150 data-[state=closed]:fade-out-0',
        )}
      />
      <DialogPrimitive.Content
        className={cn(
          'fixed z-50 flex w-full flex-col bg-card text-card-foreground shadow-float',
          'ease-snappy outline-none',
          'data-[state=open]:animate-in data-[state=open]:duration-200 data-[state=open]:fade-in-0',
          'data-[state=closed]:animate-out data-[state=closed]:duration-150 data-[state=closed]:fade-out-0',
          variants[variant],
          variant === 'sheet' ? sheetSizes[size] : dialogSizes[size],
          className,
        )}
        {...props}
      >
        {variant === 'sheet' && (
          <span
            aria-hidden
            className="mx-auto mt-2 h-1.25 w-10 shrink-0 rounded-pill bg-border md:hidden"
          />
        )}
        {children}
        {closeLabel && (
          <DialogPrimitive.Close
            aria-label={closeLabel}
            className="absolute end-3 top-3 grid size-11 cursor-pointer place-items-center rounded-pill text-muted-foreground transition-colors duration-150 hover:bg-accent hover:text-accent-foreground"
          >
            <X aria-hidden className="size-5" />
          </DialogPrimitive.Close>
        )}
      </DialogPrimitive.Content>
    </DialogPrimitive.Portal>
  );
}

function DialogHeader({ className, ...props }: React.ComponentProps<'div'>) {
  return (
    <div
      className={cn('grid shrink-0 gap-1.5 px-6 pe-14 pt-6 pb-4', className)}
      {...props}
    />
  );
}

/** The only scrolling part, inset from the card's rounded sides so its bar never touches them. */
function DialogBody({ className, ...props }: React.ComponentProps<'div'>) {
  return (
    <div
      className={cn(
        'mx-1.5 scrollbar-clean min-h-0 flex-1 overflow-y-auto overscroll-contain px-[1.125rem] py-2',
        className,
      )}
      {...props}
    />
  );
}

function DialogFooter({ className, ...props }: React.ComponentProps<'div'>) {
  return (
    <div
      className={cn(
        'flex shrink-0 flex-col-reverse gap-2 px-6 pt-4 pb-6 sm:flex-row sm:justify-end',
        className,
      )}
      {...props}
    />
  );
}

function DialogTitle({
  className,
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Title>) {
  return (
    <DialogPrimitive.Title className={cn('type-h2', className)} {...props} />
  );
}

function DialogDescription({
  className,
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Description>) {
  return (
    <DialogPrimitive.Description
      className={cn('text-sm text-muted-foreground', className)}
      {...props}
    />
  );
}

export {
  Dialog,
  DialogBody,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
};
