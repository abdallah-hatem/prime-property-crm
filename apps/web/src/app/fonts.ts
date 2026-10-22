import { IBM_Plex_Sans_Arabic, Plus_Jakarta_Sans } from 'next/font/google';

/** Latin face: geometric, friendly, tight modern numerals for counters and prices. */
export const jakarta = Plus_Jakarta_Sans({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700', '800'],
  variable: '--font-jakarta',
  display: 'swap',
});

/** Arabic face: same open, even texture, so mixed lines read as one voice. */
export const plexArabic = IBM_Plex_Sans_Arabic({
  subsets: ['arabic'],
  weight: ['400', '500', '600', '700'],
  variable: '--font-plex-arabic',
  display: 'swap',
});
