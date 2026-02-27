import { test as setup } from '@playwright/test';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const authFile = path.join(__dirname, '../../playwright/.auth/user-lair404.json');

setup('inject lair404 authentication session', async ({ page }) => {
  console.log('Injecting lair404 authentication session...');

  const SessionToken = process.env.PLAYWRIGHT_SESSION_TOKEN;
  const SessionData = process.env.PLAYWRIGHT_SESSION_DATA;
  const userEmail = process.env.EMAIL || 'fscheugenpflug4@googlemail.com';
  const serverUrl = process.env.SERVER_URL || 'http://127.0.0.1:3051';
  const frontendUrl = process.env.PLAYWRIGHT_BASE_URL || 'http://127.0.0.1:3050';

  if (!SessionToken || !SessionData) {
    throw new Error(
      'PLAYWRIGHT_SESSION_TOKEN and PLAYWRIGHT_SESSION_DATA must be set. ' +
        'Extract from DB: docker exec mail-zero-db psql -U mailzero -d mailzero ' +
        '-c "SELECT token FROM mail0_session WHERE expires_at > NOW() ORDER BY expires_at DESC LIMIT 1;"',
    );
  }

  // Rewrite production URLs to localhost — same logic as bypassCfAccess in helpers.ts
  await page.route('**/*', async (route) => {
    const url = route.request().url();

    if (url.includes('mail-api.lair404.xyz')) {
      const localUrl = url.replace('https://mail-api.lair404.xyz', serverUrl);
      await route.continue({
        url: localUrl,
        headers: {
          ...route.request().headers(),
          'x-auth-verified': 'cf-access',
          'x-cf-user-email': userEmail,
          host: '127.0.0.1:3051',
        },
      });
      return;
    }

    if (url.includes('mail.lair404.xyz') && !url.includes('mail-api.lair404.xyz')) {
      const localUrl = url.replace('https://mail.lair404.xyz', frontendUrl);
      await route.continue({ url: localUrl });
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

  await page.goto('/', { waitUntil: 'domcontentloaded', timeout: 60_000 });
  console.log('Page loaded, setting up authentication...');

  // On lair404, tests hit http://127.0.0.1:3050 — domain is 127.0.0.1
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
    {
      name: 'better-auth-dev.session_data',
      value: SessionData,
      domain: '127.0.0.1',
      path: '/',
      httpOnly: true,
      secure: false,
      sameSite: 'Lax',
    },
  ]);
  console.log('Session cookies injected for 127.0.0.1');

  try {
    const decodedSessionData = JSON.parse(atob(SessionData));

    await page.addInitScript((sessionData) => {
      if (sessionData.session) {
        localStorage.setItem('better-auth.session', JSON.stringify(sessionData.session.session));
        localStorage.setItem('better-auth.user', JSON.stringify(sessionData.session.user));
      }
    }, decodedSessionData);

    console.log('Session data set in localStorage');
  } catch (error) {
    console.log('Could not decode session data for localStorage:', error);
  }

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
