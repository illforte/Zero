import { test as setup, expect } from '@playwright/test';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const authFile = path.join(__dirname, '../../playwright/.auth/user-lair404.json');

setup('inject lair404 authentication session', async ({ page }) => {
  console.log('Injecting lair404 authentication session...');

  const SessionToken = process.env.PLAYWRIGHT_SESSION_TOKEN;
  const userEmail = process.env.EMAIL || 'fscheugenpflug4@googlemail.com';
  const serverUrl = process.env.SERVER_URL || 'http://127.0.0.1:3051';
  const frontendUrl = process.env.PLAYWRIGHT_BASE_URL || 'http://127.0.0.1:3050';

  if (!SessionToken) {
    throw new Error(
      'PLAYWRIGHT_SESSION_TOKEN must be set. ' +
        'Extract from DB: docker exec mail-zero-db psql -U mailzero -d mailzero ' +
        '-c "SELECT token FROM mail0_session WHERE expires_at > NOW() ORDER BY expires_at DESC LIMIT 1;"',
    );
  }

  // Rewrite production URLs to localhost and inject session cookie
  await page.route('**/*', async (route) => {
    const url = route.request().url();

    if (url.includes('mail-api.lair404.xyz')) {
      const localUrl = url.replace('https://mail-api.lair404.xyz', serverUrl);
      const sessionCookie = `better-auth-dev.session_token=${SessionToken}`;
      const existingCookie = route.request().headers()['cookie'] || '';
      const cookie = existingCookie ? `${existingCookie}; ${sessionCookie}` : sessionCookie;
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

  // Set session cookie for 127.0.0.1
  await page.context().addCookies([
    {
      name: 'better-auth-dev.session_token',
      value: SessionToken,
      domain: '127.0.0.1',
      path: '/',
      httpOnly: true,
      secure: false,
      sameSite: 'Lax',
    },
  ]);
  console.log('Session cookie injected');

  // Navigate and let the app load
  await page.goto('/', { waitUntil: 'domcontentloaded', timeout: 60_000 });
  console.log('Page loaded');

  // Fetch the real session data directly from the backend server.
  // The frontend's /api/ route may not proxy correctly, so call the server directly.
  // This ensures useSession() gets the correct user object shape from Better Auth.
  try {
    const sessionUrl = `${serverUrl}/api/auth/get-session`;
    console.log(`Fetching session from: ${sessionUrl}`);
    const sessionData = await page.evaluate(async ({ url, token, email }) => {
      const res = await fetch(url, {
        headers: {
          'cookie': `better-auth-dev.session_token=${token}`,
          'x-auth-verified': 'cf-access',
          'x-cf-user-email': email,
        },
      });
      if (!res.ok) {
        console.log('Session fetch failed:', res.status, await res.text().then(t => t.substring(0, 200)));
        return null;
      }
      const text = await res.text();
      try { return JSON.parse(text); } catch { return null; }
    }, { url: sessionUrl, token: SessionToken, email: userEmail });

    if (sessionData) {
      console.log('Session data from API:', JSON.stringify(sessionData).substring(0, 200));

      await page.evaluate((data) => {
        // Better Auth stores session and user separately in localStorage
        if (data.session) {
          localStorage.setItem('better-auth.session', JSON.stringify(data.session));
        }
        if (data.user) {
          localStorage.setItem('better-auth.user', JSON.stringify(data.user));
        }
      }, sessionData);

      console.log('Session data injected into localStorage from API');
    } else {
      console.log('WARNING: Could not fetch session data from API');
    }
  } catch (error) {
    console.log('Could not fetch session data:', error);
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
