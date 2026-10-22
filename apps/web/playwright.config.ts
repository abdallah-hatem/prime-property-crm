import { defineConfig, devices } from '@playwright/test';

/**
 * End-to-end tests (specs arrive with the first screens). Nothing here hardcodes a port:
 * WEB_PORT says where the web app runs (see .env.test.example), or PLAYWRIGHT_BASE_URL
 * points at a server that is already running.
 */
const port = process.env.WEB_PORT;
const baseURL =
  process.env.PLAYWRIGHT_BASE_URL ??
  (port ? `http://localhost:${port}` : undefined);

if (!baseURL) {
  throw new Error(
    'Set WEB_PORT or PLAYWRIGHT_BASE_URL to run Playwright (see .env.test.example)',
  );
}

export default defineConfig({
  testDir: './e2e',
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? 'github' : 'list',
  use: {
    baseURL,
    trace: 'retain-on-failure',
  },
  projects: [
    { name: 'mobile', use: { ...devices['Pixel 7'] } },
    { name: 'desktop', use: { ...devices['Desktop Chrome'] } },
  ],
  webServer: process.env.PLAYWRIGHT_BASE_URL
    ? undefined
    : {
        command: `npm run dev -- --port ${port}`,
        url: baseURL,
        reuseExistingServer: !process.env.CI,
        timeout: 120_000,
      },
});
