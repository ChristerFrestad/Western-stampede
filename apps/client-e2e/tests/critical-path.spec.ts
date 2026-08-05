import { test, expect } from '@playwright/test';

test.describe('Western Stampede critical path', () => {
  test('E2E-01 load shows balance and cabinet chrome', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('h1')).toContainText('Western Stampede');
    await expect(page.locator('#balance')).not.toHaveText('—', {
      timeout: 30_000,
    });
    const bal = await page.locator('#balance').innerText();
    expect(Number(bal.replace(/,/g, ''))).toBeGreaterThan(0);
  });

  test('E2E-02 spin updates balance or last-win path without crash', async ({
    page,
  }) => {
    await page.goto('/');
    await expect(page.locator('#balance')).not.toHaveText('—', {
      timeout: 30_000,
    });
    await page.locator('#btn-spin').click();
    // Wait for spin to complete (button re-enabled)
    await expect(page.locator('#btn-spin')).toBeEnabled({ timeout: 60_000 });
    const bal = await page.locator('#balance').innerText();
    expect(Number(bal.replace(/,/g, ''))).toBeGreaterThanOrEqual(0);
  });

  test('E2E-03 buy modal shows three tiers matching config costs', async ({
    page,
    request,
  }) => {
    const cfg = await request.get('http://127.0.0.1:3000/api/v1/game/config');
    expect(cfg.ok()).toBeTruthy();
    const body = await cfg.json();
    const costs: number[] = body.buyOptions.map(
      (o: { costX: number }) => o.costX,
    );

    await page.goto('/');
    await expect(page.locator('#balance')).not.toHaveText('—', {
      timeout: 30_000,
    });
    await page.locator('#btn-buy').click();
    await expect(page.locator('.modal-buy, .modal')).toBeVisible();
    await expect(page.locator('[data-tier]')).toHaveCount(3);
    for (const c of costs) {
      await expect(page.locator('.modal')).toContainText(`${c}×`);
    }
    // No stale v1.2 prices
    await expect(page.locator('.modal')).not.toContainText('22×');
    await expect(page.locator('.modal')).not.toContainText('80×');
    await expect(page.locator('.modal')).not.toContainText('145×');
  });

  test('E2E-07 rules reflect config buy packages', async ({ page, request }) => {
    const cfg = await request.get('http://127.0.0.1:3000/api/v1/game/config');
    const body = await cfg.json();
    const first = body.buyOptions[0] as { costX: number; freeGames: number };

    await page.goto('/');
    await expect(page.locator('#balance')).not.toHaveText('—', {
      timeout: 30_000,
    });
    await page.locator('#btn-rules').click();
    await expect(page.locator('.modal')).toBeVisible();
    await expect(page.locator('.modal')).toContainText(`${first.costX}×`);
    await expect(page.locator('.modal')).toContainText(String(first.freeGames));
  });

  test('E2E-08 mute toggles label', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('#balance')).not.toHaveText('—', {
      timeout: 30_000,
    });
    const mute = page.locator('#btn-mute');
    await mute.click();
    await expect(mute).toContainText(/MUTED|SOUND/);
    // Toggle again to restore
    await mute.click();
  });

  test('API health and openapi available', async ({ request }) => {
    const h = await request.get('http://127.0.0.1:3000/health');
    expect(h.ok()).toBeTruthy();
    const hj = await h.json();
    expect(hj.ok).toBeTruthy();
    expect(hj.rng.algorithm).toContain('csprng');

    const o = await request.get('http://127.0.0.1:3000/openapi.json');
    expect(o.ok()).toBeTruthy();
  });
});
