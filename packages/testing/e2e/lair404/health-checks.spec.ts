import { test, expect } from '@playwright/test';
import { dismissWelcomeModal, navigateToInbox, injectCfAccessHeaders } from './helpers';

test.describe('lair404: Browser Health Checks', () => {
  test('App loads and shows inbox with email threads', async ({ page }) => {
    await navigateToInbox(page);

    // Verify threads are present
    const threads = page.locator('[data-thread-id]');
    await expect(threads.first()).toBeVisible({ timeout: 15_000 });
    const count = await threads.count();
    console.log(`Inbox loaded with ${count} threads`);
    expect(count).toBeGreaterThan(0);
  });

  test('Settings page shows 10+ connections', async ({ page }) => {
    await injectCfAccessHeaders(page);
    await page.goto('/settings/connections');
    await page.waitForLoadState('domcontentloaded');
    await page.waitForTimeout(3000);
    await dismissWelcomeModal(page);

    // Look for connection entries — they typically show email addresses
    const connectionItems = page.locator('[data-connection-id], [data-account-id]');
    const emailTexts = page.getByText('@lair404.xyz');

    // Try both selectors
    let count = await connectionItems.count();
    if (count === 0) {
      count = await emailTexts.count();
    }

    console.log(`Found ${count} connections on settings page`);
    expect(count).toBeGreaterThanOrEqual(10);
  });

  test('AI sidebar opens via keyboard shortcut', async ({ page }) => {
    await navigateToInbox(page);

    await page.keyboard.press('Meta+0');
    const aiForm = page.locator('form#ai-chat-form');
    await expect(aiForm).toBeVisible({ timeout: 10_000 });
    console.log('AI sidebar opened successfully');

    // Verify it has an input field
    const chatInput = page.locator('form#ai-chat-form [contenteditable="true"]').first();
    await expect(chatInput).toBeVisible();
    console.log('AI chat input is ready');
  });
});
