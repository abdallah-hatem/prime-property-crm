import type { Page } from '@playwright/test';
import { messages, type Locale } from '@prime-crm/shared';
import { storageStateFor } from './accounts';
import { expect, shotPath, test } from './fixtures';

/**
 * Analytics and exports (T17) against the sample seed: the admin opens analytics, switches the
 * range, opens a member and exports the owners table. Read-only apart from the export's activity
 * entry, so no re-seed is needed between runs.
 */
test.describe.configure({ timeout: 150_000 });
test.use({ storageState: storageStateFor('admin') });

/** Hydrated (no request left) and fonts loaded, so clicks work and screenshots show real type. */
async function settle(page: Page) {
  await page.waitForLoadState('networkidle').catch(() => undefined);
  await page
    .waitForFunction(() => document.fonts.status === 'loaded', undefined, {
      timeout: 10_000,
    })
    .catch(() => undefined);
}

test('admin opens analytics, switches the range, opens a member and exports owners @smoke', async ({
  page,
}, info) => {
  const project = info.project.name;
  const locale = (info.project.metadata.locale ?? 'en') as Locale;
  const t = messages[locale].analytics;

  await page.goto('/analytics');
  await expect(page.getByTestId('analytics-page')).toBeVisible();
  await expect(page.getByTestId('stat-calls')).toBeVisible();
  await settle(page);
  await page.screenshot({
    path: shotPath(project, 'analytics-today'),
    fullPage: true,
  });

  // Last 30 days: the seed's calls fall inside it, so the outcomes chart shows.
  const last30 = page.getByRole('button', { name: t.range.last30 });
  await expect(async () => {
    await last30.click();
    await expect(page).toHaveURL(/range=last30/, { timeout: 3_000 });
  }).toPass({ timeout: 30_000 });
  await expect(last30).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByTestId('outcomes-chart')).toBeVisible({
    timeout: 20_000,
  });
  await expect(page.getByTestId('stat-calls')).not.toContainText(/^\s*0\s*$/);
  await settle(page);
  await page.screenshot({
    path: shotPath(project, 'analytics-last30'),
    fullPage: true,
  });

  // The custom range calendar.
  await page.getByTestId('range-custom').click();
  await expect(page.getByTestId('range-calendar')).toBeVisible();
  await page.waitForTimeout(400); // let the popover finish growing in
  await page.screenshot({ path: shotPath(project, 'analytics-custom-range') });
  await page.keyboard.press('Escape');

  // A member, for the same range.
  await page
    .getByRole('link', { name: /Sara Mahmoud/ })
    .filter({ visible: true })
    .first()
    .click();
  await expect(page.getByTestId('member-analytics')).toBeVisible({
    timeout: 20_000,
  });
  await expect(page).toHaveURL(/\/analytics\/members\/[^?]+\?range=last30/);
  await expect(page.getByTestId('calls-by-day')).toBeVisible();
  await settle(page);
  await page.screenshot({
    path: shotPath(project, 'analytics-member'),
    fullPage: true,
  });

  // Export the owners table with its current filters.
  await page.goto('/owners?status=NEW');
  const exportButton = page.getByTestId('export-owners');
  await expect(exportButton).toBeVisible();
  await settle(page);
  await page.screenshot({ path: shotPath(project, 'owners-export') });
  const download = page.waitForEvent('download', { timeout: 60_000 });
  await exportButton.click();
  expect((await download).suggestedFilename()).toMatch(
    /^owners-\d{4}-\d{2}-\d{2}\.xlsx$/,
  );
  await expect(exportButton).toBeEnabled();
});
