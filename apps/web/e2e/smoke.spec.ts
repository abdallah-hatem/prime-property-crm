import { storageStateFor } from './accounts';
import { expect, shotPath, test } from './fixtures';

test.use({ storageState: storageStateFor('member') });

// TODO(T12): placeholder until the web shell lands. Replace `.fixme` with the real check (the
// signed-in home screen's test id) and add a spec per screen as T13–T16 build them.
test.fixme('member lands on the home screen after sign-in @smoke @readonly', async ({
  page,
}, info) => {
  await page.goto('/');
  await expect(page.getByTestId('app-shell')).toBeVisible();
  await page.screenshot({
    path: shotPath(info.project.name, 'home'),
    fullPage: true,
  });
});
