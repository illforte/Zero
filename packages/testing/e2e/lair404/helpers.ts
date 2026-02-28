import { type Page, expect } from '@playwright/test';
import { createHmac } from 'crypto';
import { readFileSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/**
 * Sign a cookie value to match better-call's serializeSignedCookie format.
 * Format: encodeURIComponent(`${value}.${standardBase64_hmac_sha256(value, secret)}`)
 */
function signCookieValue(value: string, secret: string): string {
  const sig = createHmac('sha256', secret)
    .update(value)
    .digest('base64');
  return encodeURIComponent(`${value}.${sig}`);
}

/**
 * Get the signed session cookie value from env vars.
 * Returns empty string if no token or secret available.
 */
function getSignedSessionCookie(): string {
  const rawToken = process.env.PLAYWRIGHT_SESSION_TOKEN || '';
  const authSecret = process.env.BETTER_AUTH_SECRET || '';
  if (!rawToken) return '';
  return rawToken && authSecret ? signCookieValue(rawToken, authSecret) : rawToken;
}

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
  const signedToken = getSignedSessionCookie();

  // Load pre-built session data — from env var, or from file saved by setup step
  let sessionData: Record<string, unknown> | null = null;
  if (process.env.PLAYWRIGHT_SESSION_DATA) {
    try { sessionData = JSON.parse(process.env.PLAYWRIGHT_SESSION_DATA); } catch { /* ignore */ }
  }
  if (!sessionData) {
    try {
      const sessionFile = path.join(__dirname, '../../playwright/.auth/session-data.json');
      sessionData = JSON.parse(readFileSync(sessionFile, 'utf-8'));
    } catch { /* file doesn't exist yet — that's fine */ }
  }

  // Build the session cookie string with signed value
  const sessionCookie = signedToken
    ? `better-auth.session_token=${signedToken}`
    : '';

  await page.route('**/*', async (route) => {
    const url = route.request().url();

    // 1. Mock get-session with pre-built data — most reliable auth approach.
    //    Avoids cookie signing, CORS, and protocol mismatch issues entirely.
    if (url.includes('/api/auth/get-session') && sessionData) {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(sessionData),
      });
      return;
    }

    // 2. Mock billing (Autumn) — server doesn't serve this, nginx does
    if (url.includes('/api/autumn/')) {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          customerId: 'self-hosted',
          plan: 'pro_annual',
          features: {
            'connections': { unlimited: true, balance: 999, included_usage: 999, usage: 0 },
            'chat-messages': { unlimited: true, balance: 999, included_usage: 999, usage: 0 },
            'brain-activity': { unlimited: true, balance: 999, included_usage: 999, usage: 0 },
          },
          unlimited: true,
          credits: null,
          products: [{ id: 'pro_annual', name: 'Pro Annual', status: 'active' }],
        }),
      });
      return;
    }

    // 3. Mock providers stub
    if (url.includes('/api/public/providers')) {
      await route.fulfill({ status: 200, contentType: 'application/json', body: '[]' });
      return;
    }

    // 4. Rewrite production API/tRPC calls (mail.lair404.xyz or mail-api.lair404.xyz) to localhost.
    //    Uses fetch+fulfill because route.continue() forbids protocol change (https→http).
    if (
      (url.includes('mail-api.lair404.xyz') || url.includes('mail.lair404.xyz')) &&
      (url.includes('/api/') || url.includes('/trpc/'))
    ) {
      const rawLocalUrl = url
        .replace('https://mail-api.lair404.xyz', serverUrl)
        .replace('https://mail.lair404.xyz', serverUrl);
      // Replicate nginx rewrite: /api/trpc/X → /trpc/X
      const localUrl = rawLocalUrl.replace('/api/trpc/', '/trpc/');
      const existingCookie = route.request().headers()['cookie'] || '';
      const cookie = sessionCookie
        ? (existingCookie ? `${existingCookie}; ${sessionCookie}` : sessionCookie)
        : existingCookie;
      const response = await route.fetch({
        url: localUrl,
        headers: {
          ...route.request().headers(),
          'x-auth-verified': 'cf-access',
          'x-cf-user-email': userEmail,
          host: '127.0.0.1:3051',
          ...(cookie ? { cookie } : {}),
        },
      });
      await route.fulfill({ response });
      return;
    }

    // 5. Rewrite production frontend URLs to localhost (non-API pages).
    if (url.includes('mail.lair404.xyz') && !url.includes('mail-api.lair404.xyz')) {
      const localUrl = url.replace('https://mail.lair404.xyz', frontendUrl);
      const response = await route.fetch({ url: localUrl });
      await route.fulfill({ response });
      return;
    }

    // 6. Add CF Access bypass headers to any localhost API/tRPC calls
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
