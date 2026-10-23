import type { Locator, Page } from '@playwright/test';
import { storageStateFor } from './accounts';
import { expect, shotPath, test } from './fixtures';

/**
 * Listings (T14) on every project (phone / tablet × en / ar × light / dark), against the sample
 * seed: Sara searches, opens a listing that isn't hers (phone hidden), opens her own and logs a
 * check-in; the admin adds a listing directly. Screens are saved for review.
 */
test.describe.configure({ timeout: 120_000 });

const visible = (locator: Locator) => locator.filter({ visible: true }).first();

async function search(page: Page, text: string) {
  const box = page.getByTestId('listing-search');
  // Typing before hydration is lost on a cold dev server; retry until the URL takes it.
  await expect(async () => {
    await box.fill('');
    await box.fill(text);
    await expect(page).toHaveURL(/[?&]q=/, { timeout: 3_000 });
  }).toPass({ timeout: 30_000 });
}

/** Photos and fonts loaded (the dev server keeps a socket open, so no networkidle). */
async function settle(page: Page) {
  await page
    .waitForFunction(
      () =>
        document.fonts.status === 'loaded' &&
        [...document.images].every((image) => image.complete),
      undefined,
      { timeout: 15_000 },
    )
    .catch(() => undefined);
}

async function openOnly(page: Page) {
  const card = page.getByTestId('listing-card').filter({ visible: true });
  const row = page.locator('tbody tr').filter({ visible: true });
  await expect(card.or(row).first()).toBeVisible();
  await ((await card.count()) ? card.first() : row.first()).click();
  await expect(page.getByTestId('listing-detail')).toBeVisible({
    timeout: 20_000,
  });
}

test.describe('member', () => {
  test.use({ storageState: storageStateFor('member') });

  test('searches, sees the phone hidden on a listing not theirs, logs a check-in on their own @smoke', async ({
    page,
  }, info) => {
    const project = info.project.name;

    await page.goto('/listings');
    await expect(page.getByTestId('listing-count')).toBeVisible();
    await settle(page);
    await page.screenshot({
      path: shotPath(project, 'listings-search'),
      fullPage: true,
    });

    // Filters live in the URL; applying them doesn't scroll the page.
    const sheet = page.getByRole('dialog');
    await expect(async () => {
      await page.getByTestId('open-filters').click();
      await expect(sheet).toBeVisible({ timeout: 2_000 });
    }).toPass({ timeout: 30_000 });
    await sheet.getByRole('button', { name: /^(For sale|للبيع)$/ }).click();
    await page.screenshot({ path: shotPath(project, 'listings-filters') });
    await sheet.getByTestId('apply-filters').click();
    await expect(page).toHaveURL(/purpose=SALE/, { timeout: 20_000 });
    await expect(sheet).toBeHidden();
    await expect(page.getByTestId('listing-count')).toBeVisible();
    await page.waitForLoadState('load');
    await page
      .goto('/listings', { waitUntil: 'load' })
      .catch(() => page.goto('/listings'));

    // Omar's listing (found by its owner's name): no phone for Sara.
    await search(page, 'شركة النيل');
    await openOnly(page);
    await expect(visible(page.getByTestId('phone-hidden'))).toBeVisible();
    await expect(page.getByTestId('call-owner')).toHaveCount(0);
    await expect(page.getByTestId('log-check-in')).toHaveCount(0);

    // Her own live listing: phone, Call owner, and a check-in.
    await page.goto('/listings');
    await search(page, 'Hossam Badr');
    await openOnly(page);
    await expect(visible(page.getByTestId('call-owner'))).toBeVisible();
    await settle(page);
    await page.screenshot({
      path: shotPath(project, 'listing-detail'),
      fullPage: true,
    });
    await visible(page.getByTestId('ad-card')).screenshot({
      path: shotPath(project, 'listing-ad-card'),
    });

    const dialog = page.getByTestId('check-in-dialog');
    await expect(async () => {
      await visible(page.getByTestId('log-check-in')).click();
      await expect(dialog).toBeVisible({ timeout: 2_000 });
    }).toPass({ timeout: 30_000 });
    await dialog.getByRole('radio').first().click();
    await dialog.getByTestId('save-check-in').click();
    await expect(dialog).toBeHidden();
    await expect(
      visible(page.getByTestId('next-check-in')),
    ).not.toHaveAttribute('data-due', 'true');
  });
});

test.describe('admin', () => {
  test.use({ storageState: storageStateFor('admin') });

  test('adds a listing directly @smoke', async ({ page }, info) => {
    const project = info.project.name;
    const phone = `015${String(Math.floor(Math.random() * 1e8)).padStart(8, '0')}`;

    await page.goto('/listings');
    await expect(page.getByTestId('new-listing')).toHaveAttribute(
      'href',
      '/listings/new',
    );
    await page.goto('/listings/new');
    await expect(page.getByTestId('listing-form')).toBeVisible({
      timeout: 20_000,
    });
    await settle(page);
    await page.screenshot({
      path: shotPath(project, 'listing-form'),
      fullPage: true,
    });

    // Fill only once the form is live (the submit button unlocks on hydration).
    await expect(page.getByTestId('listing-submit')).toBeEnabled({
      timeout: 30_000,
    });
    await page.getByTestId('owner-name').fill('Smoke Test Owner');
    await page.getByTestId('owner-phone-input').fill(phone);
    await page.getByRole('button', { name: /^(For rent|للإيجار)$/ }).click();
    await page.getByRole('button', { name: /^(Studio|استوديو)$/ }).click();
    await page.getByRole('combobox').fill('Zamalek');
    await page.getByTestId('size-input').fill('75');
    await page.getByTestId('price-input').fill('25000');
    await page.getByTestId('listing-submit').click();

    await expect(page).toHaveURL(/\/listings\/[0-9a-f-]{36}$/, {
      timeout: 30_000,
    });
    await expect(page.getByTestId('listing-detail')).toContainText('Zamalek');
    await expect(visible(page.getByTestId('call-owner'))).toBeVisible();
    await expect(visible(page.getByTestId('set-live'))).toBeVisible();
  });
});
