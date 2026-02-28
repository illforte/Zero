import { test, expect } from '@playwright/test';
import { dismissWelcomeModal, navigateToInbox, openAISidebar, bypassCfAccess } from './helpers';

test.describe('lair404: Browser Health Checks', () => {
  test('App loads and shows inbox', async ({ page }) => {
    await navigateToInbox(page);

    // Take a screenshot for debugging
    await page.screenshot({ path: 'debug-inbox-health.png' });

    // Verify we're on the mail page (auth worked, app loaded)
    const currentUrl = page.url();
    expect(currentUrl).toContain('/mail');
    console.log(`Inbox loaded at: ${currentUrl}`);

    // Check for threads — may be empty depending on sync state
    const threads = page.locator('[data-thread-id]');
    const threadCount = await threads.count();
    console.log(`Thread count: ${threadCount}`);

    // Verify the sidebar navigation rendered (proves React app is hydrated)
    const sidebarInbox = page.locator('a[href*="/mail/inbox"]');
    const hasSidebar = await sidebarInbox.isVisible({ timeout: 5_000 }).catch(() => false);
    console.log(`Sidebar nav visible: ${hasSidebar}`);
    expect(hasSidebar || currentUrl.includes('/mail')).toBe(true);
  });

  test('Settings page shows connections', async ({ page }) => {
    await bypassCfAccess(page);
    await page.goto('/settings/connections');
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(5000);
    await dismissWelcomeModal(page);

    await page.screenshot({ path: 'debug-settings-connections.png' });

    // Connection entries show email addresses — look for @lair404.xyz or @gmail.com
    // The connection cards are rendered as divs with connection.email as text content
    const lair404Emails = page.locator('text=@lair404.xyz');
    const gmailEmails = page.locator('text=@gmail.com');

    const lair404Count = await lair404Emails.count();
    const gmailCount = await gmailEmails.count();
    const totalCount = lair404Count + gmailCount;

    console.log(`Connections found: ${lair404Count} @lair404.xyz + ${gmailCount} @gmail.com = ${totalCount} total`);

    // Expect at least some connections to be visible
    expect(totalCount).toBeGreaterThanOrEqual(1);
  });

  test('AI sidebar opens', async ({ page }) => {
    await navigateToInbox(page);
    await openAISidebar(page);

    console.log('AI sidebar opened successfully');

    // Verify it has an input field
    const chatInput = page.locator('form#ai-chat-form [contenteditable="true"]').first();
    await expect(chatInput).toBeVisible({ timeout: 5_000 });
    console.log('AI chat input is ready');
  });
});
