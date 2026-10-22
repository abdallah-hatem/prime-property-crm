/**
 * Colours the browser paints outside the page: the status bar / title bar (theme-color) and the
 * splash screen behind the icon (manifest background_color). They are the `--background` token of
 * each theme in src/app/globals.css; metadata and the manifest can't read CSS variables, so keep
 * them in step.
 */
export const BROWSER_CHROME_COLOURS = {
  light: '#f3f5fb',
  dark: '#0e1122',
} as const;

/** Where the installed app opens. */
export const PWA_START_URL = '/today';
