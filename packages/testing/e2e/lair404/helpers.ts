import { type Page, expect } from '@playwright/test';

/**
 * Inject CF Access bypass headers on all API/tRPC requests.
 * On lair404 production, frontdoor-auth adds these after JWT validation.
 * For localhost tests, we simulate this so the server accepts our session.
 * Must be called at the start of each test.
 */
export async function injectCfAccessHeaders(page: Page): Promise<void> {
  const userEmail = process.env.EMAIL || 'fscheugenpflug4@googlemail.com';
  await page.route('**/*', async (route) => {
    const url = route.request().url();
    if (url.includes('/api/') || url.includes('/trpc/')) {
      await route.continue({
        headers: {
          ...route.request().headers(),
          'x-auth-verified': 'cf-access',
          'x-cf-user-email': userEmail,
        },
      });
    } else {
      await route.continue();
    }
  });
}

/**
 * Dismiss the "Welcome to Zero Email!" onboarding modal if it appears.
 */
export async function dismissWelcomeModal(page: Page): Promise<void> {
  try {
    const welcomeModal = page.getByText('Welcome to Zero Email!');
    if (await welcomeModal.isVisible({ timeout: 2000 })) {
      console.log('Onboarding modal detected, dismissing...');
      await page.locator('body').click({ position: { x: 100, y: 100 } });
      await page.waitForTimeout(1500);
      console.log('Modal dismissed');
    }
  } catch {
    // No modal — continue
  }
}

/**
 * Navigate to inbox and wait for it to be ready.
 * Uses multiple selectors since the inbox view may render differently
 * depending on connection state and mailbox contents.
 */
export async function navigateToInbox(page: Page): Promise<void> {
  await injectCfAccessHeaders(page);
  await page.goto('/mail/inbox');
  await page.waitForLoadState('networkidle');
  await page.waitForTimeout(3000);
  await dismissWelcomeModal(page);

  // Wait for the app to fully render — check multiple indicators
  // The sidebar may show "Inbox", or threads may appear, or the URL confirms we're on /mail
  const inboxReady = await Promise.race([
    page.getByText('Inbox').first().isVisible({ timeout: 15_000 }).catch(() => false),
    page.locator('[data-thread-id]').first().isVisible({ timeout: 15_000 }).catch(() => false),
    page.locator('[data-sidebar]').first().isVisible({ timeout: 15_000 }).catch(() => false),
    page.waitForURL('**/mail/**', { timeout: 15_000 }).then(() => true).catch(() => false),
  ]);

  const currentUrl = page.url();
  console.log(`navigateToInbox: URL=${currentUrl}, ready=${inboxReady}`);

  if (!inboxReady && !currentUrl.includes('/mail')) {
    // Take debug screenshot before failing
    await page.screenshot({ path: `debug-inbox-${Date.now()}.png` });
    throw new Error(`Inbox did not load. Current URL: ${currentUrl}`);
  }
}

/**
 * Open the AI chat sidebar using keyboard shortcut.
 */
export async function openAISidebar(page: Page): Promise<void> {
  await page.keyboard.press('Meta+0');
  await expect(page.locator('form#ai-chat-form')).toBeVisible({ timeout: 10_000 });
}

/**
 * Send a message in the AI chat sidebar and wait for the assistant response.
 * Returns the text content of the last assistant message.
 */
export async function sendAIMessage(page: Page, message: string, timeoutMs = 60_000): Promise<string> {
  const chatInput = page.locator('form#ai-chat-form [contenteditable="true"]').first();
  await chatInput.click();
  await chatInput.fill(message);

  // Count existing assistant messages to detect new ones
  const existingCount = await page.locator('[data-message-role="assistant"]').count();

  await page.keyboard.press('Enter');

  // Wait for a new assistant message to appear
  await page.waitForFunction(
    (prevCount) => {
      const messages = document.querySelectorAll('[data-message-role="assistant"]');
      if (messages.length <= prevCount) return false;
      const last = messages[messages.length - 1];
      return last && last.textContent && last.textContent.trim().length > 5;
    },
    existingCount,
    { timeout: timeoutMs },
  );

  const lastAssistant = page.locator('[data-message-role="assistant"]').last();
  return (await lastAssistant.textContent()) || '';
}

/**
 * Wait for email threads to appear in the inbox.
 */
export async function waitForThreads(page: Page, minCount = 1, timeoutMs = 15_000): Promise<void> {
  await page.waitForFunction(
    (min) => document.querySelectorAll('[data-thread-id]').length >= min,
    minCount,
    { timeout: timeoutMs },
  );
}
