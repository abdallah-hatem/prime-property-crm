import type { Metadata, Viewport } from 'next';
import { directionOf } from '@prime-crm/shared';
import { ThemeProvider } from '@/components/theme-provider';
import { I18nProvider } from '@/i18n/i18n-provider';
import { getLocale, getTranslator } from '@/i18n/server';
import { cn } from '@/lib/utils';
import { jakarta, plexArabic } from './fonts';
import './globals.css';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslator();
  return { title: t('app.name'), description: t('app.tagline') };
}

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#f3f5fb' },
    { media: '(prefers-color-scheme: dark)', color: '#0e1122' },
  ],
};

export default async function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const locale = await getLocale();

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
          <I18nProvider locale={locale}>{children}</I18nProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
