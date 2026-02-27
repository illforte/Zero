import { type Page, expect } from '@playwright/test';

/**
 * Bypass Cloudflare Access for localhost testing.
 *
 * The frontend is built with production URLs baked in:
 *   VITE_PUBLIC_BACKEND_URL = https://mail-api.lair404.xyz
 *   VITE_PUBLIC_APP_URL     = https://mail.lair404.xyz
 *
 * When the auth-client makes XHR requests, they go to the production domain,
 * which hits CF Access at the edge and redirects to login. To test on localhost,
 * we intercept these requests and rewrite them to the local server, adding the
 * CF Access bypass headers that frontdoor-auth normally injects.
 *
 * Must be called at the start of each test (before any navigation).
 */
export async function bypassCfAccess(page: Page): Promise<void> {
  const userEmail = process.env.EMAIL || 'fscheugenpflug4@googlemail.com';
  const serverUrl = process.env.SERVER_URL || 'http://127.0.0.1:3051';
  const frontendUrl = process.env.PLAYWRIGHT_BASE_URL || 'http://127.0.0.1:3050';
  const sessionToken = process.env.PLAYWRIGHT_SESSION_TOKEN || '';

  // Build the session cookie string that Better Auth expects
  const sessionCookie = sessionToken
    ? `better-auth-dev.session_token=${sessionToken}`
    : '';

  await page.route('**/*', async (route) => {
    const url = route.request().url();

    // Rewrite production backend URLs to localhost server.
    // The browser's cookie jar has cookies for 127.0.0.1, NOT for mail-api.lair404.xyz,
    // so the session cookie is missing from the original request. We must inject it.
    if (url.includes('mail-api.lair404.xyz')) {
      const localUrl = url.replace('https://mail-api.lair404.xyz', serverUrl);
      const existingCookie = route.request().headers()['cookie'] || '';
      const cookie = existingCookie
        ? `${existingCookie}; ${sessionCookie}`
        : sessionCookie;
      await route.continue({
        url: localUrl,
        headers: {
          ...route.request().headers(),
          'x-auth-verified': 'cf-access',
          'x-cf-user-email': userEmail,
          host: '127.0.0.1:3051',
          cookie,
        },
      });
      return;
    }

    // Rewrite production frontend URLs to localhost (e.g. /cf-access/callback redirects).
    // Must use route.fetch() + route.fulfill() because route.continue() forbids protocol changes
    // (https → http), which would otherwise throw "New URL must have same protocol as overridden URL".
    if (url.includes('mail.lair404.xyz') && !url.includes('mail-api.lair404.xyz')) {
      const localUrl = url.replace('https://mail.lair404.xyz', frontendUrl);
      const response = await route.fetch({ url: localUrl });
      await route.fulfill({ response });
      return;
    }

    // Add CF Access bypass headers to any localhost API/tRPC calls
    if (url.includes('/api/') || url.includes('/trpc/')) {
      await route.continue({
        headers: {
          ...route.request().headers(),
          'x-auth-verified': 'cf-access',
          'x-cf-user-email': userEmail,
        },
      });
      return;
    }

    await route.continue();
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
  await bypassCfAccess(page);
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
