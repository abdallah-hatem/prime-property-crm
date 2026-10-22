import { test as base, expect } from '@playwright/test';
import { LOCALE_COOKIE } from '@prime-crm/shared';

/**
 * `test` with the project's locale applied: the app picks its language from the prime_locale
 * cookie (not the URL), so every page opens in the project's en / ar.
 */
export const test = base.extend({
  context: async ({ context, baseURL }, provide, testInfo) => {
    const locale = testInfo.project.metadata.locale as string | undefined;
    if (locale && baseURL)
      await context.addCookies([
        { name: LOCALE_COOKIE, value: locale, url: baseURL },
      ]);
    await provide(context);
  },
});

export { expect };

/** Where a screenshot of `screen` goes for this project (e2e/shots is gitignored). */
export const shotPath = (projectName: string, screen: string): string =>
  `e2e/shots/${projectName}/${screen}.png`;
