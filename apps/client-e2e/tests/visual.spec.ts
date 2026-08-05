import { test, expect } from '@playwright/test';

/**
 * Visual regression — baselines are OS/font-dependent (win32 snapshots in repo).
 * - Local: run normally; update with `pnpm test:e2e -- --update-snapshots`
 * - CI: skipped unless E2E_VISUAL=1 (generate Linux baselines in that job first)
 * Focus: layout chrome stability, not pixel-perfect reel animation.
 */
const skipVisual =
  !!process.env.CI && process.env.E2E_VISUAL !== '1';

test.describe('visual regression', () => {
  test.skip(skipVisual, 'OS-specific baselines; set E2E_VISUAL=1 to run in CI');

  test.use({
    viewport: { width: 1280, height: 800 },
  });

  test('idle cabinet chrome', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('#balance')).not.toHaveText('—', {
      timeout: 30_000,
    });
    // Stabilize: hide canvas (animated) for deterministic chrome compare
    await page.locator('#game-canvas').evaluate((el) => {
      (el as HTMLElement).style.visibility = 'hidden';
    });
    await expect(page.locator('#app')).toHaveScreenshot('idle-chrome.png', {
      maxDiffPixelRatio: 0.03,
      animations: 'disabled',
    });
  });

  test('buy modal layout', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('#balance')).not.toHaveText('—', {
      timeout: 30_000,
    });
    await page.locator('#btn-buy').click();
    await expect(page.locator('.buy-grid, [data-tier]').first()).toBeVisible();
    await expect(page.locator('.modal')).toHaveScreenshot('buy-modal.png', {
      maxDiffPixelRatio: 0.04,
      animations: 'disabled',
    });
  });
});
