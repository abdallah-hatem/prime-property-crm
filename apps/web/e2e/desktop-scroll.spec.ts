import { storageStateFor } from './accounts';
import { expect, test } from './fixtures';

/**
 * Phone-test feedback (2026-10-23): on desktop the mouse wheel over a table moved nothing. Each
 * table sits in a sideways scroller, which must pass vertical scrolling on to the page.
 */
test.describe('desktop tables', () => {
  test.use({
    storageState: storageStateFor('admin'),
    viewport: { width: 1280, height: 800 },
    isMobile: false,
    hasTouch: false,
  });

  test('the mouse wheel over a table scrolls the page @smoke @readonly', async ({
    page,
  }, info) => {
    test.skip(
      !info.project.name.startsWith('tablet-en-light'),
      'one desktop run is enough',
    );
    await page.goto('/owners');
    const table = page.locator('table').first();
    await expect(table).toBeVisible();
    // The seeded owners make the page taller than the viewport.
    expect(
      await page.evaluate(
        () => document.scrollingElement!.scrollHeight > window.innerHeight,
      ),
    ).toBe(true);

    const box = (await table.boundingBox())!;
    await page.mouse.move(box.x + box.width / 2, Math.min(box.y + 60, 700));
    await page.mouse.wheel(0, 400);
    await expect
      .poll(() => page.evaluate(() => document.scrollingElement!.scrollTop))
      .toBeGreaterThan(0);
  });
});
