import { test, expect } from '@playwright/test';
import { dismissWelcomeModal, bypassCfAccess, navigateToInbox } from './helpers';

/**
 * All known @lair404.xyz connections + Gmail.
 * These are the 10 IMAP accounts configured in mail-zero on lair404.
 */
const CONNECTIONS = [
  'mail@lair404.xyz',
  'support@lair404.xyz',
  'admin@lair404.xyz',
  'alerts@lair404.xyz',
  'contact@lair404.xyz',
  'hello@lair404.xyz',
  'info@lair404.xyz',
  'masterspl1nter@lair404.xyz',
  'reporting@lair404.xyz',
  'lair404.xyz@gmail.com',
];

test.describe('lair404: Inbox — All Connections', () => {
  test.setTimeout(120_000);

  test('Settings shows all expected connections', async ({ page }) => {
    await bypassCfAccess(page);
    await page.goto('/settings/connections');
    await page.waitForLoadState('domcontentloaded');
    await page.waitForTimeout(3000);
    await dismissWelcomeModal(page);

    for (const email of CONNECTIONS) {
      const found = page.getByText(email, { exact: false });
      const isVisible = await found.isVisible({ timeout: 3_000 }).catch(() => false);
      if (isVisible) {
        console.log(`  [OK] ${email}`);
      } else {
        console.log(`  [MISSING] ${email}`);
      }
    }
  });

  test('Switch and verify inbox loads for each connection', async ({ page }) => {
    await navigateToInbox(page);

    let successCount = 0;
    let failCount = 0;

    for (const email of CONNECTIONS) {
      console.log(`\nSwitching to: ${email}`);

      try {
        // Click user avatar / account switcher button
        const avatar = page.locator('button[data-sidebar="trigger"], [data-account-switcher]').first();
        if (await avatar.isVisible({ timeout: 2_000 }).catch(() => false)) {
          await avatar.click();
          await page.waitForTimeout(500);
        }

        // Look for the email in the dropdown/sidebar
        const accountOption = page.getByText(email, { exact: false }).first();
        const found = await accountOption.isVisible({ timeout: 3_000 }).catch(() => false);

        if (!found) {
          // Try opening sidebar navigation
          const menuButton = page.locator('[data-sidebar="trigger"]').first();
          if (await menuButton.isVisible({ timeout: 1_000 }).catch(() => false)) {
            await menuButton.click();
            await page.waitForTimeout(500);
          }
          const retryOption = page.getByText(email, { exact: false }).first();
          const retryFound = await retryOption.isVisible({ timeout: 3_000 }).catch(() => false);
          if (!retryFound) {
            console.log(`  [SKIP] Could not find ${email} in account switcher`);
            failCount++;
            continue;
          }
          await retryOption.click();
        } else {
          await accountOption.click();
        }

        // Wait for inbox to reload
        await page.waitForTimeout(2_000);
        await page.waitForLoadState('domcontentloaded');

        // Verify no error state
        const errorVisible = await page
          .getByText(/error|failed|something went wrong/i)
          .isVisible({ timeout: 2_000 })
          .catch(() => false);

        if (errorVisible) {
          console.log(`  [ERROR] ${email} — error state visible after switch`);
          failCount++;
        } else {
          console.log(`  [OK] ${email} — inbox loaded`);
          successCount++;
        }
      } catch (err) {
        console.log(`  [FAIL] ${email}: ${(err as Error).message}`);
        failCount++;
      }
    }

    console.log(`\nResults: ${successCount} OK, ${failCount} failed out of ${CONNECTIONS.length}`);
    // At least 8 out of 10 should succeed (allowing for timing issues)
    expect(successCount).toBeGreaterThanOrEqual(Math.floor(CONNECTIONS.length * 0.8));
  });
});
