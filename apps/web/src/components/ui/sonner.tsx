'use client';

import { useTheme } from 'next-themes';
import { Toaster as Sonner, type ToasterProps } from 'sonner';
import { useTranslation } from '@/i18n/i18n-provider';

/** Toasts in the theme's surfaces; mirrored under Arabic. Only `handleResponse` raises them. */
function Toaster(props: ToasterProps) {
  const { resolvedTheme } = useTheme();
  const { dir } = useTranslation();
  return (
    <Sonner
      theme={resolvedTheme === 'dark' ? 'dark' : 'light'}
      dir={dir}
      position="top-center"
      // Below the notch / status bar when installed full screen (viewport-fit=cover).
      offset={{ top: 'calc(24px + env(safe-area-inset-top))' }}
      mobileOffset={{ top: 'calc(16px + env(safe-area-inset-top))' }}
      toastOptions={{
        classNames: {
          toast:
            'rounded-md! bg-popover! text-popover-foreground! shadow-float! border-border!',
          description: 'text-muted-foreground!',
        },
      }}
      {...props}
    />
  );
}

export { Toaster };
