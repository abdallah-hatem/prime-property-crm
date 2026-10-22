import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { defineConfig, devices } from '@playwright/test';

/**
 * Smoke specs: sign in once per seeded role (e2e/auth.setup.ts), then walk each screen on a phone
 * and a tablet, in English and Arabic, light and dark — the same specs locally, on the preview and
 * on production (only BASE_URL changes; production runs @readonly specs only).
 *
 * Nothing here hardcodes a port. From the environment (apps/web/.env.test fills in anything unset):
 * - BASE_URL: test a server that is already running (preview, production, or your own dev server).
 * - otherwise WEB_PORT: Playwright starts `next dev` on it. API_PORT, if set, points that dev
 *   server's NEXT_PUBLIC_API_URL at http://localhost:API_PORT/api.
 * A parallel agent uses its port block (web 31N3, API 31N1) — see docs/notes/testing.md.
 */
const envFile = resolve(__dirname, '.env.test');
if (existsSync(envFile)) process.loadEnvFile(envFile);

const port = process.env.WEB_PORT;
const baseURL =
  process.env.BASE_URL ??
  process.env.PLAYWRIGHT_BASE_URL ??
  (port ? `http://localhost:${port}` : undefined);

if (!baseURL) {
  throw new Error(
    'Set BASE_URL or WEB_PORT to run Playwright (see apps/web/.env.test.example)',
  );
}

const apiPort = process.env.API_PORT;
const bypass = process.env.VERCEL_AUTOMATION_BYPASS_SECRET;

const viewports = {
  mobile: devices['iPhone 13'],
  tablet: devices['iPad (gen 7)'],
} as const;
const locales = ['en', 'ar'] as const;
const schemes = ['light', 'dark'] as const;

export default defineConfig({
  testDir: './e2e',
  outputDir: './test-results',
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? 'github' : 'list',
  use: {
    baseURL,
    trace: 'retain-on-failure',
    // Vercel previews are protected; this header lets the specs through.
    extraHTTPHeaders: bypass
      ? {
          'x-vercel-protection-bypass': bypass,
          'x-vercel-set-bypass-cookie': 'true',
        }
      : undefined,
  },
  projects: [
    { name: 'auth', testMatch: /auth\.setup\.ts/ },
    ...Object.entries(viewports).flatMap(([viewport, device]) =>
      locales.flatMap((locale) =>
        schemes.map((colorScheme) => ({
          name: `${viewport}-${locale}-${colorScheme}`,
          dependencies: ['auth'],
          testIgnore: /auth\.setup\.ts/,
          metadata: { locale },
          use: {
            ...device,
            // The device presets pin WebKit; Chromium is the one browser installed.
            defaultBrowserType: 'chromium' as const,
            locale,
            colorScheme,
          },
        })),
      ),
    ),
  ],
  webServer:
    process.env.BASE_URL || process.env.PLAYWRIGHT_BASE_URL
      ? undefined
      : {
          command: `npm run dev -- --port ${port}`,
          url: baseURL,
          reuseExistingServer: !process.env.CI,
          timeout: 120_000,
          env: apiPort
            ? { NEXT_PUBLIC_API_URL: `http://localhost:${apiPort}/api` }
            : undefined,
        },
});
