import { test as setup } from '@playwright/test';
import { createHmac } from 'crypto';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const authFile = path.join(__dirname, '../../playwright/.auth/user-lair404.json');

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

setup('inject lair404 authentication session', async ({ page }) => {
  console.log('Injecting lair404 authentication session...');

  const rawToken = process.env.PLAYWRIGHT_SESSION_TOKEN;
  const authSecret = process.env.BETTER_AUTH_SECRET;
  const userEmail = process.env.EMAIL || 'fscheugenpflug4@googlemail.com';
  const serverUrl = process.env.SERVER_URL || 'http://127.0.0.1:3051';
  const frontendUrl = process.env.PLAYWRIGHT_BASE_URL || 'http://127.0.0.1:3050';

  if (!rawToken) {
    console.log('No PLAYWRIGHT_SESSION_TOKEN — auth tests will fail');
  }
  if (!authSecret) {
    console.log('No BETTER_AUTH_SECRET — cookie signing disabled, auth may fail');
  }

  // Sign the token the same way Better Auth does
  const signedToken = rawToken && authSecret ? signCookieValue(rawToken, authSecret) : rawToken || '';
  console.log(`Token signed: ${!!authSecret}, length: ${signedToken.length}`);

  // Step 1: Fetch session data from backend via Node.js fetch (bypasses CORS)
  let sessionData: Record<string, unknown> | null = null;

  if (process.env.PLAYWRIGHT_SESSION_DATA) {
    try {
      sessionData = JSON.parse(process.env.PLAYWRIGHT_SESSION_DATA);
      console.log('Using pre-set PLAYWRIGHT_SESSION_DATA');
    } catch { /* ignore */ }
  }

  if (!sessionData && signedToken) {
    try {
      const sessionUrl = `${serverUrl}/api/auth/get-session`;
      console.log(`Fetching session from: ${sessionUrl}`);
      const res = await fetch(sessionUrl, {
        headers: {
          cookie: `better-auth.session_token=${signedToken}`,
          'x-auth-verified': 'cf-access',
          'x-cf-user-email': userEmail,
        },
      });
      console.log(`Session API response: ${res.status}`);
      if (res.ok) {
        const data = await res.json() as Record<string, unknown>;
        if (data && (data.session || data.user)) {
          sessionData = data;
          // Set env so test workers can use it
          process.env.PLAYWRIGHT_SESSION_DATA = JSON.stringify(data);
          console.log('Session data fetched:', JSON.stringify(data).substring(0, 300));
        }
      } else {
        console.log('WARNING: get-session returned', res.status);
      }
    } catch (error) {
      console.log('Could not fetch session data:', error);
    }
  }

  // Step 2: Register route handlers — mock get-session + rewrite production URLs
  await page.route('**/*', async (route) => {
    const url = route.request().url();

    // Mock get-session with pre-fetched data — guarantees auth works
    if (url.includes('/api/auth/get-session') && sessionData) {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(sessionData),
      });
      return;
    }

    // Mock billing (Autumn)
    if (url.includes('/api/autumn/')) {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          customerId: 'self-hosted', plan: 'pro_annual',
          features: {
            'connections': { unlimited: true, balance: 999, included_usage: 999, usage: 0 },
            'chat-messages': { unlimited: true, balance: 999, included_usage: 999, usage: 0 },
            'brain-activity': { unlimited: true, balance: 999, included_usage: 999, usage: 0 },
          },
          unlimited: true, credits: null,
          products: [{ id: 'pro_annual', name: 'Pro Annual', status: 'active' }],
        }),
      });
      return;
    }

    // Mock providers stub
    if (url.includes('/api/public/providers')) {
      await route.fulfill({ status: 200, contentType: 'application/json', body: '[]' });
      return;
    }

    // Rewrite production API/tRPC calls to localhost (fetch+fulfill for https→http)
    if (
      (url.includes('mail-api.lair404.xyz') || url.includes('mail.lair404.xyz')) &&
      (url.includes('/api/') || url.includes('/trpc/'))
    ) {
      const rawLocalUrl = url
        .replace('https://mail-api.lair404.xyz', serverUrl)
        .replace('https://mail.lair404.xyz', serverUrl);
      const localUrl = rawLocalUrl.replace('/api/trpc/', '/trpc/');
      const sessionCookie = signedToken ? `better-auth.session_token=${signedToken}` : '';
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

    // Rewrite production frontend pages to localhost
    if (url.includes('mail.lair404.xyz') && !url.includes('mail-api.lair404.xyz')) {
      const localUrl = url.replace('https://mail.lair404.xyz', frontendUrl);
      const response = await route.fetch({ url: localUrl });
      await route.fulfill({ response });
      return;
    }

    // CF Access bypass for localhost API calls
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

  // Step 3: Set session cookie for 127.0.0.1
  if (signedToken) {
    await page.context().addCookies([
      {
        name: 'better-auth.session_token',
        value: signedToken,
        domain: '127.0.0.1',
        path: '/',
        httpOnly: true,
        secure: false,
        sameSite: 'Lax',
      },
    ]);
    console.log('Signed session cookie injected');
  }

  // Step 4: Navigate and inject localStorage
  await page.goto('/', { waitUntil: 'domcontentloaded', timeout: 60_000 });
  console.log('Page loaded');

  if (sessionData) {
    await page.evaluate((data) => {
      if (data.session) {
        localStorage.setItem('better-auth.session', JSON.stringify(data.session));
      }
      if (data.user) {
        localStorage.setItem('better-auth.user', JSON.stringify(data.user));
      }
    }, sessionData as { session?: unknown; user?: unknown });
    console.log('Session data injected into localStorage');
  }

  // Step 5: Navigate to inbox to verify auth
  await page.goto('/mail/inbox');
  await page.waitForLoadState('domcontentloaded');

  const currentUrl = page.url();
  if (currentUrl.includes('/mail')) {
    console.log('Successfully reached mail app:', currentUrl);
  } else {
    console.log('Did not reach mail app. Current URL:', currentUrl);
    await page.screenshot({ path: 'debug-auth-lair404-failed.png' });
  }

  // Step 6: Save storage state (cookies + localStorage) for test workers
  await page.context().storageState({ path: authFile });
  console.log('lair404 authentication session saved!');

  // Write session data to a temp file so test workers can load it
  if (sessionData) {
    const fs = await import('fs');
    const sessionFile = path.join(__dirname, '../../playwright/.auth/session-data.json');
    fs.writeFileSync(sessionFile, JSON.stringify(sessionData));
    console.log('Session data saved to', sessionFile);
  }
});
