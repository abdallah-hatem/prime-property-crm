/**
 * Motion tokens for JavaScript animation; the same values as the CSS tokens in globals.css
 * (--ease-snappy, --motion-*). Ease-out, 200–250ms in, 150ms out.
 */
export const ease = [0.22, 1, 0.36, 1] as const;
export const easeDrawer = [0.32, 0.72, 0, 1] as const;

/** Seconds. */
export const duration = { exit: 0.15, base: 0.2, slow: 0.25 } as const;

/** Gap between staggered items (counters rising). */
export const stagger = 0.05;
