import * as React from 'react';
import { cn } from '@/lib/utils';

/** 16px on phones so iOS Safari never zooms; 14px from md up. */
function Input({ className, type, ...props }: React.ComponentProps<'input'>) {
  return (
    <input
      type={type}
      data-slot="input"
      className={cn(
        'h-11 w-full min-w-0 rounded-sm border border-input bg-card px-4 text-base text-foreground shadow-soft md:text-sm',
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

export { Input };
