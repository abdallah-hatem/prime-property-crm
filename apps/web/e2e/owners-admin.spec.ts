import type { Page } from '@playwright/test';
import { storageStateFor } from './accounts';
import { expect, shotPath, test } from './fixtures';

/**
 * Admin owners and imports (T15), on the sample seed: the admin imports a small generated CSV of
 * owners through the wizard (upload → columns → preview → confirm → report), opens the imported
 * owners, selects all of them and assigns them to Sara. Screens are saved for review.
 */
test.describe.configure({ timeout: 180_000 });
test.use({ storageState: storageStateFor('admin') });

const MEMBER = 'Sara Mahmoud';

/** A valid Egyptian mobile nobody else has (random, so every run and project imports new rows). */
const mobile = () =>
  `010${String(Math.floor(Math.random() * 1e8)).padStart(8, '0')}`;

function ownersCsv(): { csv: string; added: number } {
  const phones = Array.from({ length: 5 }, mobile);
  const rows = [
    'Full name,Mobile,Area,Notes',
    `Nadia Fathy,${phones[0]},Maadi,Prefers evenings`,
    `هاني عبد الله,${phones[1]},New Cairo,`,
    `Mona Salem,${phones[2]},Madinaty,`,
    `Tarek Hamdy,${phones[3]},Sheikh Zayed,`,
    `Youssef Adel,${phones[4]},Maadi,`,
    `Nadia again,${phones[0]},Maadi,same phone as row 1`,
    `No phone,12345,Maadi,`,
  ];
  return { csv: `${rows.join('\n')}\n`, added: 5 };
}

/** Fonts loaded before a screenshot. */
async function settle(page: Page) {
  await page
    .waitForFunction(() => document.fonts.status === 'loaded', undefined, {
      timeout: 10_000,
    })
    .catch(() => undefined);
}

/** The page never scrolls sideways (a wide table scrolls inside its card). */
async function noSideScroll(page: Page) {
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - window.innerWidth,
  );
  expect(overflow).toBeLessThanOrEqual(0);
}

const count = (page: Page, key: string) =>
  page.locator(`[data-count="${key}"] dd`);

test('admin imports a CSV of owners and assigns them to a member @smoke', async ({
  page,
}, info) => {
  const project = info.project.name;
  const { csv, added } = ownersCsv();

  // The owners table, before anything changes.
  await page.goto('/owners');
  await expect(page.getByTestId('select-all-matching')).toBeVisible();
  await settle(page);
  await page.screenshot({ path: shotPath(project, 'owners-admin-table') });
  await noSideScroll(page);

  // 1. File.
  await page.goto('/imports/new');
  await expect(page.getByTestId('step-file')).toBeVisible();
  await settle(page);
  await page.screenshot({ path: shotPath(project, 'import-1-file') });
  await expect(async () => {
    await page.getByTestId('file-input').setInputFiles({
      name: `owners-${project}.csv`,
      mimeType: 'text/csv',
      buffer: Buffer.from(csv, 'utf8'),
    });
    await expect(page.getByTestId('step-columns')).toBeVisible({
      timeout: 10_000,
    });
  }).toPass({ timeout: 40_000 });

  // 2. Columns: suggested from the headers (name, phone, area, note).
  await expect(page.getByTestId('map-name')).toContainText('Full name');
  await expect(page.getByTestId('map-phone')).toContainText('Mobile');
  await page.screenshot({
    path: shotPath(project, 'import-2-columns'),
    fullPage: true,
  });
  await page.getByTestId('run-preview').click();

  // 3. Preview: one duplicate (row 6 repeats row 1), one rejected phone.
  await expect(page.getByTestId('step-preview')).toBeVisible({
    timeout: 30_000,
  });
  await expect(count(page, 'added')).toHaveText(String(added));
  await expect(count(page, 'duplicates')).toHaveText('1');
  await expect(count(page, 'rejected')).toHaveText('1');
  await expect(
    page.getByTestId('preview-issues').getByTestId('import-issue'),
  ).toHaveCount(2);
  await page.screenshot({
    path: shotPath(project, 'import-3-preview'),
    fullPage: true,
  });
  await noSideScroll(page);

  // 4. Confirm once; the report has the counts.
  await page.getByTestId('confirm-import').click();
  await expect(page.getByTestId('step-report')).toBeVisible({
    timeout: 60_000,
  });
  await expect(count(page, 'added')).toHaveText(String(added));
  await page.screenshot({ path: shotPath(project, 'import-4-report') });

  // The imported owners, then all of them selected and assigned to Sara.
  await page
    .getByTestId('step-report')
    .getByRole('link', { name: /owners|الملاك/ })
    .click();
  await expect(page).toHaveURL(/importId=/, { timeout: 20_000 });
  await expect(page.getByTestId('select-all-matching')).toBeEnabled();
  await page.getByTestId('select-all-matching').click();
  const dock = page.getByTestId('selection-dock');
  await expect(dock).toContainText(String(added));
  await settle(page);
  await page.waitForTimeout(300); // the dock's entrance settles
  await page.screenshot({ path: shotPath(project, 'owners-admin-selected') });

  await dock.getByTestId('open-assign').click();
  const dialog = page.getByTestId('assign-dialog');
  await expect(dialog).toBeVisible();
  await dialog.getByTestId('assignee-select').click();
  await page.getByRole('option', { name: MEMBER }).click();
  await expect(page.getByRole('listbox')).toBeHidden();
  await page.waitForTimeout(300); // the sheet's and the list's motion settle
  await page.screenshot({ path: shotPath(project, 'assign-dialog') });
  await dialog.getByTestId('assign-confirm').click();
  await expect(dialog).toBeHidden({ timeout: 20_000 });
  await expect(dock).toBeHidden();

  // Every imported owner now shows Sara.
  await page.reload();
  const visible = page
    .locator('[data-testid="owner-row"], tbody tr')
    .filter({ visible: true });
  await expect(visible).toHaveCount(added);
  await expect(visible.filter({ hasText: MEMBER })).toHaveCount(added);

  // The import is in the list with its counts, and its page lists the skipped rows.
  await page.goto('/imports');
  const job = page
    .locator('[data-testid="import-card"], tbody tr')
    .filter({ visible: true })
    .filter({ hasText: `owners-${project}.csv` })
    .first();
  await expect(job).toBeVisible();
  await settle(page);
  await page.screenshot({ path: shotPath(project, 'imports-list') });
  await job.click();
  await expect(page).toHaveURL(/\/imports\/[0-9a-f-]{36}$/, {
    timeout: 20_000,
  });
  await expect(
    page.locator('[data-testid="import-issue"], tbody tr').filter({
      visible: true,
    }),
  ).toHaveCount(2);
  await settle(page);
  await page.screenshot({
    path: shotPath(project, 'import-detail'),
    fullPage: true,
  });
});
