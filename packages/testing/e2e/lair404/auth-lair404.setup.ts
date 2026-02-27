import { test as setup } from '@playwright/test';
import { createHmac } from 'crypto';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const authFile = path.join(__dirname, '../../playwright/.auth/user-lair404.json');

/**
 * Sign a cookie value to match better-call's serializeSignedCookie format.
 * Format: encodeURIComponent(`${value}.${standardBase64_hmac_sha256(value, secret)}`)
 *
 * Critical: better-call's guard checks signature.length === 44 && signature.endsWith("=")
 */
function signCookieValue(value: string, secret: string): string {
  const sig = createHmac('sha256', secret)
    .update(value)
    .digest('base64'); // standard base64 WITH padding
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

  // Rewrite production URLs to localhost and inject session cookie
  await page.route('**/*', async (route) => {
    const url = route.request().url();

    if (url.includes('mail-api.lair404.xyz')) {
      const localUrl = url.replace('https://mail-api.lair404.xyz', serverUrl);
      const existingCookie = route.request().headers()['cookie'] || '';
      const sessionCookie = signedToken ? `better-auth.session_token=${signedToken}` : '';
      const cookie = sessionCookie ? (existingCookie ? `${existingCookie}; ${sessionCookie}` : sessionCookie) : existingCookie;
      await route.continue({
        url: localUrl,
        headers: {
          ...route.request().headers(),
          'x-auth-verified': 'cf-access',
          'x-cf-user-email': userEmail,
          host: '127.0.0.1:3051',
          ...(cookie ? { cookie } : {}),
        },
      });
      return;
    }

    if (url.includes('mail.lair404.xyz') && !url.includes('mail-api.lair404.xyz')) {
      const localUrl = url.replace('https://mail.lair404.xyz', frontendUrl);
      const response = await route.fetch({ url: localUrl });
      await route.fulfill({ response });
      return;
    }

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

  // Set signed session cookie for 127.0.0.1
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
  } else {
    console.log('No session token to inject');
  }

  // Navigate and let the app load
  await page.goto('/', { waitUntil: 'domcontentloaded', timeout: 60_000 });
  console.log('Page loaded');

  // Fetch real session data from the backend using the signed cookie
  if (signedToken) {
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
        const sessionData = await res.json();
        console.log('Session data:', JSON.stringify(sessionData).substring(0, 300));

        if (sessionData && (sessionData.session || sessionData.user)) {
          await page.evaluate((data) => {
            if (data.session) {
              localStorage.setItem('better-auth.session', JSON.stringify(data.session));
            }
            if (data.user) {
              localStorage.setItem('better-auth.user', JSON.stringify(data.user));
            }
          }, sessionData);
          console.log('Session data injected into localStorage');
        } else {
          console.log('WARNING: Session API returned unexpected shape:', Object.keys(sessionData));
        }
      } else {
        const text = await res.text();
        console.log('WARNING: Session API returned', res.status, text.substring(0, 200));
      }
    } catch (error) {
      console.log('Could not fetch session data:', error);
    }
  }

  // Reload to pick up localStorage changes
  await page.goto('/mail/inbox');
  await page.waitForLoadState('domcontentloaded');

  const currentUrl = page.url();
  if (currentUrl.includes('/mail')) {
    console.log('Successfully reached mail app:', currentUrl);
  } else {
    console.log('Did not reach mail app. Current URL:', currentUrl);
    await page.screenshot({ path: 'debug-auth-lair404-failed.png' });
  }

  await page.context().storageState({ path: authFile });
  console.log('lair404 authentication session saved!');
});
