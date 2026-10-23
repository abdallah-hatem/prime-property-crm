import type { Locator, Page } from '@playwright/test';
import { storageStateFor } from './accounts';
import { expect, shotPath, test } from './fixtures';

/**
 * Admin screens (T16) against the sample seed: the admin adds a user, deactivates them with a
 * hand-over, restores an item from the trash and edits a call outcome; every admin page is
 * screenshotted for review. Re-seed before a run: each run restores one trashed item.
 */
test.describe.configure({ timeout: 150_000 });
test.use({ storageState: storageStateFor('admin') });

const visible = (locator: Locator) => locator.filter({ visible: true }).first();

/** Hydrated (no request left) and fonts loaded, so clicks work and screenshots show real type. */
async function settle(page: Page) {
  await page.waitForLoadState('networkidle').catch(() => undefined);
  await page
    .waitForFunction(() => document.fonts.status === 'loaded', undefined, {
      timeout: 10_000,
    })
    .catch(() => undefined);
}

/** Click until the dialog it opens shows (a click before hydration does nothing). */
async function openWith(trigger: Locator, dialog: Locator) {
  await expect(async () => {
    await trigger.click();
    await expect(dialog).toBeVisible({ timeout: 2_000 });
  }).toPass({ timeout: 30_000 });
}

async function pick(page: Page, trigger: Locator, option: string | RegExp) {
  await trigger.click();
  await page.getByRole('option', { name: option }).first().click();
}

test('admin creates a user, then deactivates them with a hand-over @smoke', async ({
  page,
}, info) => {
  const project = info.project.name;
  const stamp = `${Date.now()}${Math.floor(Math.random() * 1e3)}`;
  const name = `Smoke Agent ${stamp.slice(-6)}`;
  const email = `smoke.${stamp}@prime.test`;

  await page.goto('/users');
  await expect(page.getByTestId('users-page')).toBeVisible();
  await settle(page);
  await page.screenshot({
    path: shotPath(project, 'admin-users'),
    fullPage: true,
  });

  const form = page.getByTestId('user-form');
  await openWith(page.getByTestId('add-user'), form);
  // Validation first: a bad email and a short mobile block the request.
  await form.getByTestId('user-email').fill('not-an-email');
  await form.getByTestId('user-phone').fill('0101');
  await form.getByTestId('user-submit').click();
  await expect(form.locator('[aria-invalid="true"]').first()).toBeVisible();
  await page.screenshot({ path: shotPath(project, 'admin-user-form') });

  await form.getByTestId('user-name').fill(name);
  await form.getByTestId('user-email').fill(email);
  await form.getByTestId('user-phone').fill(`012${stamp.slice(-8)}`);
  await pick(page, form.getByTestId('user-role'), 'Team member');
  await form.getByTestId('user-password').fill(`Pw-${stamp}`);
  await form.getByTestId('user-submit').click();
  await expect(form).toBeHidden({ timeout: 20_000 });

  // Find them and open their sheet.
  await page.getByRole('searchbox').fill(email);
  await expect(page).toHaveURL(/[?&]q=/, { timeout: 20_000 });
  const manage = visible(page.getByRole('button', { name: new RegExp(name) }));
  const sheet = page.getByTestId('user-sheet');
  await openWith(manage, sheet);
  await page.screenshot({ path: shotPath(project, 'admin-user-sheet') });

  // Deactivate: the hand-over choice is required.
  const deactivate = page.getByTestId('deactivate-form');
  await sheet.getByTestId('user-action-deactivate').click();
  await expect(deactivate).toBeVisible();
  // The submit unlocks once what would move has loaded.
  await expect(deactivate.getByTestId('deactivate-submit')).toBeEnabled({
    timeout: 20_000,
  });
  await deactivate.getByTestId('deactivate-submit').click();
  await expect(deactivate.getByRole('alert')).toBeVisible();
  await deactivate.getByTestId('choice-member').click();
  await pick(page, deactivate.getByTestId('handover-member'), /Sara/);
  await page.screenshot({ path: shotPath(project, 'admin-deactivate') });
  await deactivate.getByTestId('deactivate-submit').click();
  await expect(deactivate).toBeHidden({ timeout: 20_000 });

  // The list now shows them deactivated; their sheet offers Reactivate.
  await expect(manage).toHaveAttribute('data-active', 'false', {
    timeout: 20_000,
  });
  await openWith(manage, sheet);
  await expect(sheet.getByTestId('user-action-reactivate')).toBeVisible();
});

test('the only admin cannot be deactivated, and Admin permissions are locked @smoke', async ({
  page,
}, info) => {
  const project = info.project.name;
  await page.goto('/users');
  const sheet = page.getByTestId('user-sheet');
  await openWith(
    visible(page.getByRole('button', { name: /^(Manage|إدارة) Admin$/ })),
    sheet,
  );
  await expect(sheet.getByTestId('user-action-deactivate')).toBeDisabled();

  await page.goto('/roles');
  await expect(page.getByTestId('roles-page')).toBeVisible();
  await settle(page);
  await page.screenshot({
    path: shotPath(project, 'admin-roles'),
    fullPage: true,
  });
  const editor = page.getByTestId('role-form');
  await openWith(page.getByTestId('role-card').first(), editor);
  await expect(editor.getByTestId('permission-users.manage')).toBeDisabled();
  await expect(editor.getByTestId('role-delete')).toBeDisabled();
  await page.screenshot({ path: shotPath(project, 'admin-role-editor') });
});

test('admin edits a call outcome @smoke', async ({ page }, info) => {
  const project = info.project.name;
  await page.goto('/settings');
  await expect(page.getByTestId('settings-page')).toBeVisible();
  await settle(page);
  await page.screenshot({
    path: shotPath(project, 'admin-settings'),
    fullPage: true,
  });

  const row = page.locator('[data-testid="outcome-row"][data-outcome="Busy"]');
  const form = page.getByTestId('outcome-form');
  await openWith(row.getByTestId('outcome-edit'), form);
  await page.screenshot({ path: shotPath(project, 'admin-outcome-form') });
  await form.getByTestId('outcome-label-en').fill('Busy line');
  await form.getByTestId('outcome-submit').click();
  await expect(form).toBeHidden({ timeout: 20_000 });
  const renamed = page.locator(
    '[data-testid="outcome-row"][data-outcome="Busy line"]',
  );
  await expect(renamed).toBeVisible();

  // Put it back, so the next run (and the calling specs) see the seeded name.
  await openWith(renamed.getByTestId('outcome-edit'), form);
  await form.getByTestId('outcome-label-en').fill('Busy');
  await form.getByTestId('outcome-submit').click();
  await expect(form).toBeHidden({ timeout: 20_000 });
  await expect(row).toBeVisible();

  // An outcome calls already use can't be deleted: Hide is offered instead.
  await row.getByTestId('outcome-delete').click();
  await expect(page.getByRole('dialog')).toBeVisible();
  await page.screenshot({ path: shotPath(project, 'admin-outcome-in-use') });
  await page.keyboard.press('Escape');
});

test('admin restores an item from the trash @smoke', async ({ page }, info) => {
  const project = info.project.name;
  await page.goto('/trash');
  await expect(page.getByTestId('trash-page')).toBeVisible();
  await settle(page);
  await page.screenshot({
    path: shotPath(project, 'admin-trash'),
    fullPage: true,
  });

  const restore = page.getByTestId('trash-restore').filter({ visible: true });
  const before = await restore.count();
  test.skip(before === 0, 'Nothing left in the trash: re-seed the database.');
  await restore.first().click();
  await expect(restore).toHaveCount(before - 1, { timeout: 20_000 });
});

test('admin reads the activity log @smoke', async ({ page }, info) => {
  const project = info.project.name;
  await page.goto('/activity');
  await expect(page.getByTestId('activity-page')).toBeVisible();
  await settle(page);
  await page.screenshot({
    path: shotPath(project, 'admin-activity'),
    fullPage: true,
  });

  const details = page.getByTestId('activity-details');
  const first = visible(
    page.getByTestId('activity-card').or(page.locator('tbody tr')),
  );
  await openWith(first, details);
  await page.screenshot({ path: shotPath(project, 'admin-activity-details') });
});
