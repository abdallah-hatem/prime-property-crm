import { storageStateFor, type Role } from './accounts';
import { expect, shotPath, test } from './fixtures';

/**
 * The signed-in shell for each role, in every project (phone / tablet × en / ar × light / dark):
 * lands on its home, draws the menus its permissions allow, and is screenshotted for review.
 */
const SHELL_ROLES: Role[] = ['admin', 'member'];

for (const role of SHELL_ROLES) {
  test.describe(role, () => {
    test.use({ storageState: storageStateFor(role) });

    test(`${role} lands on the signed-in shell @smoke @readonly`, async ({
      page,
    }, info) => {
      const locale = info.project.metadata.locale as string;
      const phone = info.project.name.startsWith('mobile');

      await page.goto('/');
      // The admin reads analytics, so their home is the dashboard; a member's is Today.
      await expect(page).toHaveURL(
        role === 'admin' ? /\/analytics$/ : /\/today$/,
      );
      await expect(page.getByTestId('app-shell')).toBeVisible();
      await expect(page.locator('html')).toHaveAttribute(
        'dir',
        locale === 'ar' ? 'rtl' : 'ltr',
      );
      await page.screenshot({
        path: shotPath(info.project.name, `${role}-today`),
        fullPage: true,
      });

      // Admin links follow the permissions: all of them for the admin, none for a member.
      if (phone) await page.goto('/more');
      await expect(
        page.locator('a[href="/users"]').filter({ visible: true }),
      ).toHaveCount(role === 'admin' ? 1 : 0);
      if (phone)
        await page.screenshot({
          path: shotPath(info.project.name, `${role}-more`),
          fullPage: true,
        });

      await page.getByTestId('account-menu').filter({ visible: true }).click();
      await expect(
        page.getByRole('dialog').getByTestId('account-name'),
      ).toBeVisible();
      await page.screenshot({
        path: shotPath(info.project.name, `${role}-account-menu`),
      });

      if (!phone) {
        // Desktop width for the same project (the sidebar with room to breathe).
        await page.keyboard.press('Escape');
        await page.setViewportSize({ width: 1280, height: 800 });
        await page.goto('/today');
        await page.screenshot({
          path: shotPath(info.project.name, `${role}-desktop`),
        });
      }
    });
  });
}

test.describe('member on an admin page', () => {
  test.use({ storageState: storageStateFor('member') });

  test('is sent to their home @smoke @readonly', async ({ page }) => {
    await page.goto('/users');
    await expect(page).toHaveURL(/\/today$/);
    await page.goto('/login');
    await expect(page).toHaveURL(/\/today$/);
  });
});

test.describe('signed out', () => {
  test.use({ storageState: { cookies: [], origins: [] } });

  test('a protected page goes to login with the return path @smoke @readonly', async ({
    page,
  }, info) => {
    await page.goto('/listings?page=2');
    await expect(page).toHaveURL(/\/login\?next=%2Flistings%3Fpage%3D2$/);
    await expect(page.getByTestId('login-submit')).toBeVisible();
    await page.waitForLoadState('networkidle');
    await page.screenshot({
      path: shotPath(info.project.name, 'login'),
      fullPage: true,
    });
  });
});
