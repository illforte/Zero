import { defineConfig, devices } from '@playwright/test';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load lair404-specific env, fall back to root .env
dotenv.config({ path: path.resolve(__dirname, '.env.lair404.e2e') });
dotenv.config({ path: path.resolve(__dirname, '../../.env') });

export default defineConfig({
  testDir: './e2e/lair404',
  fullyParallel: false,
  forbidOnly: true,
  retries: 1,
  workers: 1,
  reporter: [
    ['html', { outputFolder: 'playwright-report-lair404' }],
    ['list'],
  ],
  timeout: 120_000,
  expect: {
    timeout: 15_000,
  },
  use: {
    baseURL: process.env.PLAYWRIGHT_BASE_URL || 'http://127.0.0.1:3050',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    video: 'on-first-retry',
  },
  projects: [
    {
      name: 'lair404-setup',
      testMatch: /auth-lair404\.setup\.ts/,
      use: { ...devices['Desktop Chrome'] },
    },
    {
      name: 'lair404-chromium',
      use: {
        ...devices['Desktop Chrome'],
        storageState: 'playwright/.auth/user-lair404.json',
      },
      dependencies: ['lair404-setup'],
    },
  ],
});
