import { type Page, expect } from '@playwright/test';
import { createHmac } from 'crypto';

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

/** Module-level cache so we only fetch once per worker process. */
let _sessionDataCache: Record<string, unknown> | null = null;
let _sessionDataFetched = false;

/**
 * Fetch session data from the backend using Node.js fetch (bypasses CORS).
 * Cached per worker process so subsequent calls are instant.
 */
async function getSessionData(): Promise<Record<string, unknown> | null> {
  if (_sessionDataFetched) return _sessionDataCache;
  _sessionDataFetched = true;

  // Try env var first (set by setup step)
  if (process.env.PLAYWRIGHT_SESSION_DATA) {
    try {
      _sessionDataCache = JSON.parse(process.env.PLAYWRIGHT_SESSION_DATA) as Record<string, unknown>;
      return _sessionDataCache;
    } catch { /* ignore */ }
  }

  // Fetch directly from the server using Node.js fetch (bypasses CORS)
  const signedToken = getSignedSessionCookie();
  const serverUrl = process.env.SERVER_URL || 'http://127.0.0.1:3051';
  const userEmail = process.env.EMAIL || 'fscheugenpflug4@googlemail.com';

  if (!signedToken) {
    console.log('[getSessionData] No signed token available');
    return null;
  }

  try {
    const url = `${serverUrl}/api/auth/get-session`;
    console.log(`[getSessionData] Fetching ${url} with cookie length=${signedToken.length}`);
    // In production (NODE_ENV=production + BETTER_AUTH_URL=https://...), better-auth
    // sets the __Secure- prefix on all cookies. Use that prefix for the server-side fetch.
    const res = await fetch(url, {
      headers: {
        cookie: `__Secure-better-auth.session_token=${signedToken}`,
        'x-auth-verified': 'cf-access',
        'x-cf-user-email': userEmail,
      },
    });
    console.log(`[getSessionData] Response: ${res.status} ${res.statusText}`);
    if (res.ok) {
      const text = await res.text();
      console.log(`[getSessionData] Body (first 200): ${text.substring(0, 200)}`);
      if (text && text !== 'null') {
        const data = JSON.parse(text) as Record<string, unknown>;
        if (data && (data.session || data.user)) {
          _sessionDataCache = data;
          return data;
        }
        console.log(`[getSessionData] Data has no session/user. Keys: ${Object.keys(data)}`);
      } else {
        console.log('[getSessionData] Body is null or empty');
      }
    }
  } catch (err) {
    console.log(`[getSessionData] Fetch error: ${err}`);
  }

  return null;
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

  // Fetch session data from server (cached per worker process)
  const sessionData = await getSessionData();
  console.log(`[bypassCfAccess] sessionData=${sessionData ? 'loaded' : 'null'}, signedToken=${signedToken ? 'present' : 'missing'}, BETTER_AUTH_SECRET=${process.env.BETTER_AUTH_SECRET ? 'set' : 'NOT SET'}`);

  // Build the session cookie string with signed value.
  // In production (NODE_ENV=production + BETTER_AUTH_URL=https://...), better-auth
  // uses the __Secure- cookie prefix. This must match for session validation to succeed.
  const sessionCookie = signedToken
    ? `__Secure-better-auth.session_token=${signedToken}`
    : '';

  await page.route('**/*', async (route) => {
    const url = route.request().url();

    // 1. Mock get-session with pre-built data — most reliable auth approach.
    //    Avoids cookie signing, CORS, and protocol mismatch issues entirely.
    if (url.includes('/api/auth/get-session') && sessionData) {
      console.log(`[MOCK] get-session intercepted: ${url}`);
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
      console.log(`[REWRITE] ${url.substring(0, 80)} → ${localUrl.substring(0, 80)}`);
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
      console.log(`[FRONTEND] ${url.substring(0, 80)} → ${localUrl.substring(0, 80)}`);
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
 * Open the AI chat sidebar.
 * Uses URL parameter approach (most reliable in headless), falling back to
 * keyboard shortcut and then button click.
 */
export async function openAISidebar(page: Page): Promise<void> {
  const aiForm = page.locator('form#ai-chat-form');

  // Already open?
  if (await aiForm.isVisible({ timeout: 1_000 }).catch(() => false)) return;

  // Method 1: Append ?aiSidebar=true to URL (the app reads this query param)
  const currentUrl = new URL(page.url());
  currentUrl.searchParams.set('aiSidebar', 'true');
  await page.goto(currentUrl.toString(), { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(2000);
  if (await aiForm.isVisible({ timeout: 3_000 }).catch(() => false)) return;

  // Method 2: Keyboard shortcut (Meta+0 on Mac, may not work on Linux headless)
  await page.keyboard.press('Meta+0');
  if (await aiForm.isVisible({ timeout: 3_000 }).catch(() => false)) return;

  // Method 3: Click the AI toggle button in the bottom-right corner
  const toggleBtn = page.getByRole('button', { name: /toggle ai|ai assistant/i });
  if (await toggleBtn.isVisible({ timeout: 2_000 }).catch(() => false)) {
    await toggleBtn.click();
  }

  await expect(aiForm).toBeVisible({ timeout: 10_000 });
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
