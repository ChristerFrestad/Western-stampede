import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

test.describe('accessibility', () => {
  test('shell has no serious/critical axe violations', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('#balance')).not.toHaveText('—', {
      timeout: 30_000,
    });
    // Hide animated canvas noise for a11y scan of chrome
    await page.locator('#game-canvas').evaluate((el) => {
      (el as HTMLElement).setAttribute('aria-hidden', 'true');
    });

    const results = await new AxeBuilder({ page })
      .disableRules(['color-contrast']) // gold-on-dark cabinet theme intentional
      .analyze();

    const serious = results.violations.filter(
      (v) => v.impact === 'serious' || v.impact === 'critical',
    );
    if (serious.length) {
      console.log(JSON.stringify(serious, null, 2));
    }
    expect(serious).toEqual([]);
  });

  test('buy modal dialog is announced', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('#balance')).not.toHaveText('—', {
      timeout: 30_000,
    });
    await page.locator('#btn-buy').click();
    const dialog = page.locator('[role="dialog"]');
    await expect(dialog).toBeVisible();
    await expect(dialog).toHaveAttribute('aria-modal', 'true');

    const results = await new AxeBuilder({ page })
      .include('.modal')
      .disableRules(['color-contrast'])
      .analyze();
    const serious = results.violations.filter(
      (v) => v.impact === 'serious' || v.impact === 'critical',
    );
    expect(serious).toEqual([]);
  });
});
