import { storageStateFor } from './accounts';
import { expect, test } from './fixtures';

/**
 * Theme and language survive a reload and are right on the server's first paint: with every
 * Next.js script blocked, the reloaded page is already dark, Arabic and right-to-left. Uses the
 * Team lead account (its saved language is restored at the end) and runs in one project only.
 */
test.use({ storageState: storageStateFor('lead') });

test('theme and language persist across reload with no flash @smoke', async ({
  page,
}, info) => {
  test.skip(info.project.name !== 'mobile-en-light', 'one project is enough');

  await page.goto('/more');
  const theme = page.getByRole('group', { name: 'Theme' });
  await theme.getByRole('button', { name: 'Dark' }).click();
  await expect(page.locator('html')).toHaveClass(/\bdark\b/);
  await page
    .getByRole('group', { name: 'Language' })
    .getByRole('button', { name: 'العربية' })
    .click();
  await expect(page.locator('html')).toHaveAttribute('lang', 'ar');

  // First paint only: block every script chunk (next-themes' inline script still runs).
  await page.route('**/_next/static/**/*.js', (route) => route.abort());
  await page.reload();
  const html = page.locator('html');
  await expect(html).toHaveAttribute('lang', 'ar');
  await expect(html).toHaveAttribute('dir', 'rtl');
  await expect(html).toHaveClass(/\bdark\b/);
  await expect(page.getByTestId('account-name')).toHaveText(/\S/);
  await page.unroute('**/_next/static/**/*.js');

  // Put the account back as it was.
  await page.reload();
  await page
    .getByRole('group', { name: 'المظهر' })
    .getByRole('button', { name: 'حسب الجهاز' })
    .click();
  await page
    .getByRole('group', { name: 'اللغة' })
    .getByRole('button', { name: 'English' })
    .click();
  await expect(page.locator('html')).toHaveAttribute('lang', 'en');
});
