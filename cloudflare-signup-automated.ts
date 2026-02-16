#!/usr/bin/env tsx
/**
 * Automated Cloudflare Account Creation
 *
 * Uses:
 * - ScraperAPI residential proxy rotation
 * - Playwright stealth mode
 * - Existing Google OAuth session
 * - Complete address profile
 *
 * Goal: Create lair404.xyz Cloudflare account fully automated
 */

import { chromium } from 'playwright';
import * as fs from 'fs';

const SCRAPERAPI_KEY = process.env.SCRAPERAPI_API_KEY || '0732a61c08af7fd42b1285a6c144c3f2';
const GOOGLE_SESSION_PATH = process.env.GOOGLE_SESSION_PATH || '/tmp/google-lair404.json';

const PROFILE = {
  email: 'lair404.xyz@gmail.com',
  firstName: 'Lars',
  lastName: 'Viervier',
  company: 'lair404 Infrastructure',
  phone: '+49 9493 123456',
  address: {
    street: 'Eichenstr. 11',
    city: 'Beratzhausen',
    state: 'Bayern',
    zip: '93176',
    country: 'Germany'
  }
};

async function createCloudflareAccount() {
  console.log('🚀 Cloudflare Account Automation');
  console.log('='.repeat(60));

  // Load Google session
  if (!fs.existsSync(GOOGLE_SESSION_PATH)) {
    throw new Error(`Google session not found: ${GOOGLE_SESSION_PATH}`);
  }

  const storageState = JSON.parse(fs.readFileSync(GOOGLE_SESSION_PATH, 'utf-8'));
  console.log(`✅ Loaded Google session (${storageState.cookies?.length || 0} cookies)`);

  // Launch browser with residential proxy
  const browser = await chromium.launch({
    headless: false, // Non-headless to see what's happening
    proxy: {
      server: 'http://proxy-server.scraperapi.com:8001',
      username: 'scraperapi',
      password: `api_key=${SCRAPERAPI_KEY}`
    },
    args: [
      '--disable-blink-features=AutomationControlled',
      '--disable-features=IsolateOrigins,site-per-process',
      '--no-sandbox'
    ]
  });

  const context = await browser.newContext({
    storageState,
    userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
    viewport: { width: 1920, height: 1080 },
    locale: 'de-DE',
    timezoneId: 'Europe/Berlin',
    geolocation: { latitude: 49.0350, longitude: 12.0420 },
    permissions: ['geolocation'],
    colorScheme: 'light',
    deviceScaleFactor: 2,
    extraHTTPHeaders: {
      'Accept-Language': 'de-DE,de;q=0.9,en;q=0.8',
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8'
    }
  });

  // Anti-detection
  await context.addInitScript(() => {
    Object.defineProperty(navigator, 'webdriver', { get: () => false });
    Object.defineProperty(navigator, 'plugins', {
      get: () => [
        { name: 'Chrome PDF Plugin', description: 'Portable Document Format' },
        { name: 'Chrome PDF Viewer', description: 'PDF Viewer' },
        { name: 'Native Client', description: 'Native Client Executable' }
      ]
    });
    Object.defineProperty(navigator, 'languages', { get: () => ['de-DE', 'de', 'en-US', 'en'] });
  });

  const page = await context.newPage();
  const screenshots = [];

  try {
    console.log('\n[1/8] 📝 Navigating to Cloudflare signup...');
    await page.goto('https://dash.cloudflare.com/sign-up', {
      waitUntil: 'domcontentloaded',
      timeout: 120000
    });

    console.log('[1/8] ⏳ Waiting for Cloudflare challenge (residential proxy should help)...');
    await page.waitForTimeout(10000);

    const screenshot1 = '/tmp/cf-1-landing.png';
    await page.screenshot({ path: screenshot1, fullPage: true });
    screenshots.push(screenshot1);
    console.log(`[1/8] 📸 Screenshot: ${screenshot1}`);

    // Check if we passed the challenge
    const currentUrl = page.url();
    if (currentUrl.includes('challenges') || currentUrl.includes('security-check')) {
      console.log('[1/8] ⚠️ Still on Cloudflare challenge page!');
      console.log('[1/8] 💡 You may need to solve CAPTCHA manually in the browser window');
      console.log('[1/8] ⏸️ Pausing for 30 seconds...');
      await page.waitForTimeout(30000);
    }

    console.log('\n[2/8] 🔐 Looking for Google SSO button...');
    const googleButton = page.locator('button:has-text("Google"), a:has-text("Google"), button:has-text("Sign up with Google")').first();

    if (await googleButton.count() > 0) {
      await googleButton.click();
      console.log('[2/8] ✅ Clicked Google button');
    } else {
      console.log('[2/8] ⚠️ No Google button found - checking if already logged in...');
    }

    console.log('\n[3/8] ⏳ Waiting for OAuth redirect...');
    await page.waitForTimeout(5000);
    await page.waitForURL(/dash\.cloudflare\.com/, { timeout: 120000 });

    const screenshot2 = '/tmp/cf-2-post-oauth.png';
    await page.screenshot({ path: screenshot2, fullPage: true });
    screenshots.push(screenshot2);
    console.log(`[3/8] 📸 Screenshot: ${screenshot2}`);

    console.log('\n[4/8] 📋 Checking for profile form...');
    const hasProfileForm = await page.locator('input[name="firstName"], input[placeholder*="First"]').count() > 0;

    if (hasProfileForm) {
      console.log('[4/8] ✍️ Filling profile form...');

      await page.fill('input[name="firstName"], input[placeholder*="First"]', PROFILE.firstName).catch(() => {});
      await page.fill('input[name="lastName"], input[placeholder*="Last"]', PROFILE.lastName).catch(() => {});
      await page.fill('input[name="company"], input[placeholder*="Company"]', PROFILE.company).catch(() => {});
      await page.fill('input[name="phone"], input[type="tel"]', PROFILE.phone).catch(() => {});

      const screenshot3 = '/tmp/cf-3-profile-filled.png';
      await page.screenshot({ path: screenshot3, fullPage: true });
      screenshots.push(screenshot3);
      console.log(`[4/8] 📸 Screenshot: ${screenshot3}`);

      await page.click('button[type="submit"], button:has-text("Continue")');
      await page.waitForTimeout(3000);
    } else {
      console.log('[4/8] ℹ️ No profile form - skipping');
    }

    console.log('\n[5/8] 🎯 Extracting Account ID...');
    const url = page.url();
    console.log(`[5/8] URL: ${url}`);

    const accountIdMatch = url.match(/dash\.cloudflare\.com\/([a-f0-9]{32})/);
    let accountId = accountIdMatch?.[1];

    if (!accountId) {
      const bodyText = await page.textContent('body');
      const bodyMatch = bodyText?.match(/([a-f0-9]{32})/);
      accountId = bodyMatch?.[1];
    }

    if (accountId) {
      fs.writeFileSync('/tmp/cf-account-id.txt', accountId);
      console.log(`[5/8] ✅ Account ID: ${accountId}`);
    } else {
      throw new Error('Could not extract Account ID');
    }

    console.log('\n[6/8] 🔑 Navigating to API tokens...');
    await page.goto('https://dash.cloudflare.com/profile/api-tokens', {
      waitUntil: 'domcontentloaded'
    });
    await page.waitForTimeout(3000);

    const screenshot4 = '/tmp/cf-4-tokens.png';
    await page.screenshot({ path: screenshot4, fullPage: true });
    screenshots.push(screenshot4);

    console.log('\n[7/8] ➕ Creating API token...');
    await page.click('button:has-text("Create Token")');
    await page.waitForTimeout(2000);

    await page.click('button:has-text("Use template")');
    await page.waitForTimeout(2000);

    await page.click('button:has-text("Continue to summary")');
    await page.waitForTimeout(2000);

    await page.click('button:has-text("Create Token")');
    await page.waitForTimeout(4000);

    const screenshot5 = '/tmp/cf-5-token.png';
    await page.screenshot({ path: screenshot5, fullPage: true });
    screenshots.push(screenshot5);

    console.log('\n[8/8] 📋 Extracting API token...');
    const tokenElement = page.locator('input[readonly], textarea[readonly]').first();
    const token = await tokenElement.inputValue();

    if (token && token.length > 20) {
      fs.writeFileSync('/tmp/cf-api-token.txt', token);
      console.log(`[8/8] ✅ Token: ${token.substring(0, 50)}...`);
    } else {
      throw new Error('Could not extract API token');
    }

    await browser.close();

    console.log('\n' + '='.repeat(60));
    console.log('✅ SUCCESS!');
    console.log('='.repeat(60));
    console.log(`Account ID: ${accountId}`);
    console.log(`API Token: ${token.substring(0, 60)}...`);
    console.log(`\nScreenshots: ${screenshots.join(', ')}`);
    console.log('='.repeat(60));

    return { accountId, token, screenshots };

  } catch (error) {
    console.error('\n❌ ERROR:', error);
    const errorScreenshot = '/tmp/cf-error.png';
    await page.screenshot({ path: errorScreenshot, fullPage: true }).catch(() => {});
    screenshots.push(errorScreenshot);
    await browser.close();

    console.log(`\nScreenshots for debugging: ${screenshots.join(', ')}`);
    throw error;
  }
}

// Run
createCloudflareAccount()
  .then(() => process.exit(0))
  .catch(err => {
    console.error('Failed:', err.message);
    process.exit(1);
  });
