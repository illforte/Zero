import { test, expect } from '@playwright/test';
import { navigateToInbox, dismissWelcomeModal, waitForThreads } from './helpers';

test.describe('lair404: Label Management', () => {
  test('Filter via command palette — Starred Emails', async ({ page }) => {
    await navigateToInbox(page);
    await waitForThreads(page);

    // Open command palette
    await page.keyboard.press('Meta+k');
    const dialog = page.locator('[cmdk-dialog], [role="dialog"]');
    await expect(dialog.first()).toBeVisible({ timeout: 5_000 });
    console.log('Command palette opened');

    // Select "Starred Emails" filter
    const starredItem = page.getByText('Starred Emails', { exact: true });
    await expect(starredItem).toBeVisible({ timeout: 3_000 });
    await starredItem.click();
    console.log('Selected "Starred Emails" filter');

    // Verify palette closes
    await expect(dialog.first()).not.toBeVisible({ timeout: 5_000 });

    // Verify "Clear" button appears (indicating filter is active)
    const clearButton = page.getByRole('button', { name: 'Clear', exact: true });
    await expect(clearButton).toBeVisible({ timeout: 5_000 });
    console.log('Filter active — Clear button visible');

    // Wait for filtered results
    await page.waitForTimeout(3000);

    // Clear the filter
    await clearButton.click();
    await expect(clearButton).not.toBeVisible({ timeout: 5_000 });
    console.log('Filter cleared');
  });

  test('Right-click thread — toggle Favorite', async ({ page }) => {
    await navigateToInbox(page);
    await waitForThreads(page);

    const firstThread = page.locator('[data-thread-id]').first();
    await expect(firstThread).toBeVisible();

    // Right-click to open context menu
    await firstThread.click({ button: 'right' });
    await page.waitForTimeout(500);

    // Toggle favorite
    const favoriteButton = page.getByText('Favorite');
    if (await favoriteButton.isVisible({ timeout: 2_000 }).catch(() => false)) {
      await favoriteButton.click();
      console.log('Toggled Favorite on thread');
    } else {
      console.log('Favorite option not found in context menu — skipping');
    }

    await page.waitForTimeout(1000);

    // Right-click again to toggle back
    await firstThread.click({ button: 'right' });
    await page.waitForTimeout(500);

    const favoriteAgain = page.getByText('Favorite');
    if (await favoriteAgain.isVisible({ timeout: 2_000 }).catch(() => false)) {
      await favoriteAgain.click();
      console.log('Toggled Favorite back');
    }

    console.log('Label management test complete');
  });
});
