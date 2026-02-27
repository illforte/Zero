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

  if (!SessionToken || !SessionData) {
    throw new Error(
      'PLAYWRIGHT_SESSION_TOKEN and PLAYWRIGHT_SESSION_DATA must be set. ' +
        'Extract from DB: docker exec mail-zero-db psql -U mailzero -d mailzero ' +
        '-c "SELECT token FROM mail0_session WHERE expires_at > NOW() ORDER BY expires_at DESC LIMIT 1;"',
    );
  }

  // Intercept all API requests and inject CF Access bypass headers.
  // On lair404 production, frontdoor-auth adds these headers after JWT validation.
  // For localhost testing, we simulate this bypass so the server accepts our session.
  await page.route('**/*', async (route) => {
    const request = route.request();
    const url = request.url();

    // Add CF Access headers to API/tRPC calls to the server
    if (url.includes('/api/') || url.includes('/trpc/')) {
      const headers = {
        ...request.headers(),
        'x-auth-verified': 'cf-access',
        'x-cf-user-email': userEmail,
      };
      await route.continue({ headers });
    } else {
      await route.continue();
    }
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
  console.log('Session cookies + CF Access headers injected');

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
