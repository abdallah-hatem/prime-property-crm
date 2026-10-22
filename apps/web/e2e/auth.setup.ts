import { test as setup } from '@playwright/test';
import { LOGIN_PATH, ROLES, type Role, storageStateFor } from './accounts';

/**
 * Signs in once per seeded role and saves the session to e2e/.auth/<role>.json; every spec
 * reuses it with `test.use({ storageState: storageStateFor('member') })`. Run the seed first
 * (`npm run db:seed` with SEED_ALLOW_SAMPLE=true) against the database the API uses.
 */
for (const role of Object.keys(ROLES) as Role[]) {
  setup(`sign in as ${role}`, async ({ page }) => {
    const { email, passwordEnv } = ROLES[role];
    const password = process.env[passwordEnv];
    if (!password)
      throw new Error(
        `Set ${passwordEnv} (the seed's password) to sign in as ${role}`,
      );

    await page.goto(LOGIN_PATH);
    await page.getByTestId('login-email').fill(email);
    await page.getByTestId('login-password').fill(password);
    await page.getByTestId('login-submit').click();
    await page.waitForURL((url) => !url.pathname.startsWith(LOGIN_PATH));
    await page.context().storageState({ path: storageStateFor(role) });
  });
}
