import type { Metadata, Viewport } from 'next';
import { directionOf } from '@prime-crm/shared';
import { SessionProvider } from '@/components/session-provider';
import { ThemeColorSync } from '@/components/theme-color-sync';
import { ThemeProvider } from '@/components/theme-provider';
import { Toaster } from '@/components/ui/sonner';
import { I18nProvider } from '@/i18n/i18n-provider';
import { getLocale, getTranslator } from '@/i18n/server';
import { BROWSER_CHROME_COLOURS } from '@/lib/pwa';
import { getSession } from '@/lib/session';
import { cn } from '@/lib/utils';
import { jakarta, plexArabic } from './fonts';
import './globals.css';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslator();
  return {
    title: t('app.name'),
    description: t('app.tagline'),
    applicationName: 'Prime CRM',
    // manifest.webmanifest is linked by Next from app/manifest.ts.
    icons: {
      icon: [
        { url: '/favicon.ico', sizes: '48x48' },
        { url: '/icons/icon.svg', type: 'image/svg+xml' },
      ],
      apple: [{ url: '/icons/apple-touch-icon.png', sizes: '180x180' }],
    },
    // iOS home-screen app: full screen, its own name under the icon, a status bar that follows the
    // page colour (dark text on light, light text on dark) rather than a translucent overlay.
    appleWebApp: {
      capable: true,
      title: 'Prime CRM',
      statusBarStyle: 'default',
    },
    formatDetection: { telephone: false },
  };
}

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  // Content may draw under the notch and home indicator; the shell pads with safe-area insets.
  // Pinch-zoom stays on: no maximum-scale or user-scalable=no.
  viewportFit: 'cover',
  colorScheme: 'light dark',
  themeColor: [
    {
      media: '(prefers-color-scheme: light)',
      color: BROWSER_CHROME_COLOURS.light,
    },
    {
      media: '(prefers-color-scheme: dark)',
      color: BROWSER_CHROME_COLOURS.dark,
    },
  ],
};

export default async function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  // Both read on the server, so the first paint is in the user's language and shows who they are.
  const [locale, session] = await Promise.all([getLocale(), getSession()]);

  return (
    // next-themes writes the theme class before paint; the server can't know it.
    <html
      lang={locale}
      dir={directionOf(locale)}
      className={cn(jakarta.variable, plexArabic.variable)}
      suppressHydrationWarning
    >
      <body>
        <ThemeProvider>
          <ThemeColorSync />
          <I18nProvider locale={locale}>
            <SessionProvider
              me={session.status === 'signedIn' ? session.me : null}
            >
              {children}
              <Toaster />
            </SessionProvider>
          </I18nProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
