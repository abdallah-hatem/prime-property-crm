import type { MetadataRoute } from 'next';
import { BROWSER_CHROME_COLOURS, PWA_START_URL } from '@/lib/pwa';

/**
 * The installed app. Browsers fetch the manifest without cookies, so it can't follow the user's
 * language: the name is the brand (the same in Arabic UI) and `dir: auto` lets either script
 * render correctly. Light colours here; dark comes from the theme-color media queries in layout.
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    id: PWA_START_URL,
    name: 'Prime CRM',
    short_name: 'Prime CRM',
    description: 'Owners, calls and listings for the Prime team',
    lang: 'en',
    dir: 'auto',
    start_url: PWA_START_URL,
    scope: '/',
    display: 'standalone',
    orientation: 'any',
    background_color: BROWSER_CHROME_COLOURS.light,
    theme_color: BROWSER_CHROME_COLOURS.light,
    categories: ['business', 'productivity'],
    icons: [
      {
        src: '/icons/icon-192.png',
        sizes: '192x192',
        type: 'image/png',
        purpose: 'any',
      },
      {
        src: '/icons/icon-512.png',
        sizes: '512x512',
        type: 'image/png',
        purpose: 'any',
      },
      {
        src: '/icons/icon-maskable-512.png',
        sizes: '512x512',
        type: 'image/png',
        purpose: 'maskable',
      },
      {
        src: '/icons/icon.svg',
        sizes: 'any',
        type: 'image/svg+xml',
        purpose: 'any',
      },
    ],
  };
}
