import * as React from 'react';
import { cn } from '@/lib/utils';

/** Prose fields (notes, reasons): four rows to start, grows with its text; 16px on phones. */
function Textarea({
  className,
  rows = 4,
  ...props
}: React.ComponentProps<'textarea'>) {
  return (
    <textarea
      data-slot="textarea"
      rows={rows}
      className={cn(
        'field-sizing-content min-h-24 w-full min-w-0 rounded-sm border border-input bg-card px-4 py-3 text-base text-foreground shadow-soft md:text-sm',
        'scrollbar-clean max-h-60 resize-none overflow-y-auto',
        'transition-[border-color,box-shadow] duration-200 ease-snappy',
        'selection:bg-primary selection:text-primary-foreground placeholder:text-muted-foreground',
        'outline-none focus-visible:border-ring focus-visible:ring-4 focus-visible:ring-ring/20',
        'disabled:cursor-not-allowed disabled:opacity-50',
        'aria-invalid:border-destructive aria-invalid:ring-4 aria-invalid:ring-destructive/15',
        className,
      )}
      {...props}
    />
  );
}

export { Textarea };
