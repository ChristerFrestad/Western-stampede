import { defineConfig, devices } from '@playwright/test';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const RGS = process.env.RGS_URL ?? 'http://127.0.0.1:3000';
const WEB = process.env.WEB_URL ?? 'http://127.0.0.1:5173';

export default defineConfig({
  testDir: './tests',
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: 1,
  timeout: 90_000,
  expect: { timeout: 20_000 },
  reporter: process.env.CI ? [['github'], ['list']] : 'list',
  use: {
    baseURL: WEB,
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: [
    {
      command: 'pnpm exec tsx src/main.ts',
      cwd: resolve(root, 'apps/rgs-api'),
      url: `${RGS}/health`,
      reuseExistingServer: !process.env.CI,
      timeout: 180_000,
      env: {
        ...process.env,
        PORT: '3000',
        REAL_MONEY: 'false',
        COMPLIANCE_MODE: 'false',
        // Prefer Postgres in CI when DATABASE_URL is injected; empty = memory locally
        DATABASE_URL: process.env.DATABASE_URL ?? '',
      },
    },
    {
      command: 'pnpm exec vite --host 127.0.0.1 --port 5173',
      cwd: resolve(root, 'apps/client'),
      url: WEB,
      reuseExistingServer: !process.env.CI,
      timeout: 180_000,
    },
  ],
});
