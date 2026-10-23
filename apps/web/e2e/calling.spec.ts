import { storageStateFor } from './accounts';
import { expect, shotPath, test } from './fixtures';

/**
 * The calling loop end to end against the real API: Today → Call (the dialer is stubbed) → the
 * outcome sheet → left for later, so it shows in Outcome missing → outcome saved from there → it
 * leaves Outcome missing. Screens are shot in every project (phone / tablet × en / ar × light / dark).
 */

/** Record `tel:` links instead of letting the browser hand them to the OS. */
async function stubDialer(page: import('@playwright/test').Page) {
  await page.addInitScript(() => {
    const w = window as unknown as { __dialed: string[] };
    w.__dialed = [];
    const click = HTMLAnchorElement.prototype.click;
    HTMLAnchorElement.prototype.click = function (this: HTMLAnchorElement) {
      if (this.href.startsWith('tel:')) w.__dialed.push(this.href);
      else click.call(this);
    };
  });
}

test.describe('member', () => {
  test.use({ storageState: storageStateFor('member') });

  test('calls an owner from Today and sets the outcome @smoke', async ({
    page,
  }, info) => {
    test.setTimeout(120_000);
    await stubDialer(page);
    await page.goto('/today');
    await expect(page.getByTestId('calling-list')).toBeVisible();
    await page.screenshot({
      path: shotPath(info.project.name, 'today'),
      fullPage: true,
    });

    const row = page
      .getByTestId('calling-list')
      .getByTestId('owner-row')
      .first();
    const name =
      (await row.locator('[title]').first().getAttribute('title')) ?? '';
    expect(name).not.toBe('');
    // Earlier runs may have left calls to this owner without an outcome; count from here.
    const missing = page
      .getByTestId('missing-outcome')
      .filter({ hasText: name });
    const before = await missing.count();
    await row.getByTestId('call-button').click();

    // An owner with several numbers asks which one first.
    const sheet = page.getByTestId('outcome-sheet');
    const chooser = page.getByTestId('phone-chooser');
    await expect(sheet.or(chooser)).toBeVisible({ timeout: 15_000 });
    if (await chooser.isVisible())
      await chooser.getByRole('button').first().click();

    // No dialer takes the page away here, so the sheet opens on its own after a moment.
    await expect(sheet).toBeVisible({ timeout: 15_000 });
    expect(
      await page.evaluate(
        () => (window as unknown as { __dialed: string[] }).__dialed,
      ),
    ).toHaveLength(1);
    await expect(sheet.getByRole('radio').first()).toBeVisible();
    await page.screenshot({
      path: shotPath(info.project.name, 'outcome-sheet'),
    });

    // Left for later: the call waits in Outcome missing.
    await sheet.getByRole('button', { name: /^(Later|لاحقًا)$/ }).click();
    await expect(missing).toHaveCount(before + 1, { timeout: 15_000 });

    await missing.first().getByRole('button').click();
    await expect(sheet).toBeVisible();
    await sheet.getByRole('radio').first().click();
    await sheet.getByTestId('outcome-save').click();
    await expect(sheet).toBeHidden();
    await expect(missing).toHaveCount(before, { timeout: 15_000 });
  });

  test('opens an owner and the reminders @smoke', async ({ page }, info) => {
    await page.goto('/owners');
    const first = page
      .locator('a[href^="/owners/"]')
      .filter({ visible: true })
      .first();
    await first.click();
    await expect(page).toHaveURL(/\/owners\/[0-9a-f-]{36}$/);
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
    await page.screenshot({
      path: shotPath(info.project.name, 'owner-detail'),
      fullPage: true,
    });

    await page.goto('/reminders');
    await expect(page.getByRole('group').first()).toBeVisible();
    await page.screenshot({
      path: shotPath(info.project.name, 'reminders'),
      fullPage: true,
    });
  });
});

test.describe('admin', () => {
  test.use({ storageState: storageStateFor('admin') });

  test('views an owner detail @smoke @readonly', async ({ page }, info) => {
    await page.goto('/owners');
    const first = page
      .locator('a[href^="/owners/"]')
      .filter({ visible: true })
      .first();
    await first.click();
    await expect(page).toHaveURL(/\/owners\/[0-9a-f-]{36}$/);
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
    // Someone else's owner: the admin reads it but can't call it.
    await expect(
      page.getByRole('heading', { name: /History|السجل/ }),
    ).toBeVisible();
    await page.screenshot({
      path: shotPath(info.project.name, 'admin-owner-detail'),
      fullPage: true,
    });
  });
});
